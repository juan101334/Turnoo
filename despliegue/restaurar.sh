#!/usr/bin/env bash
# Restaura una copia cifrada de respaldar.sh en una base NUEVA (y, si se indica, las imágenes en
# una carpeta NUEVA). Nunca escribe sobre una base o carpeta que ya existe: para reemplazar la de
# producción, primero se restaura aparte, se revisa, y luego se cambia a mano (docs/SEGURIDAD.md).
#
# Uso, desde cualquier carpeta, en el equipo que tiene la llave PRIVADA:
#   ./despliegue/restaurar.sh backups/turnoo-FECHA.dump.gpg BASE_NUEVA [backups/archivos-FECHA.tar.gz.gpg CARPETA_NUEVA]
#
# Variables:
#   RESPALDO_LOCAL=1  usa createdb y pg_restore de este equipo (conexión en PGHOST, PGPORT, PGUSER,
#                     PGPASSWORD, como superusuario o el dueño de la base); si no, el contenedor db.
# Los roles (turnoo_app) ya deben existir en el servidor: son del servidor, no de la base.
set -euo pipefail

if [ $# -ne 2 ] && [ $# -ne 4 ]; then
  echo "Uso: $0 COPIA.dump.gpg BASE_NUEVA [COPIA_ARCHIVOS.tar.gz.gpg CARPETA_NUEVA]" >&2
  exit 2
fi
copia_base=$(realpath "$1")
base_nueva="$2"
copia_archivos="${3:+$(realpath "$3")}"
carpeta_nueva="${4:-}"

if ! [[ "$base_nueva" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
  echo "El nombre de la base solo puede tener minúsculas, números y _." >&2
  exit 2
fi
if [ -n "$carpeta_nueva" ] && [ -e "$carpeta_nueva" ]; then
  echo "La carpeta $carpeta_nueva ya existe: elige una nueva." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
descifrar() { gpg --batch --quiet --decrypt "$1"; }

if [ "${RESPALDO_LOCAL:-0}" = 1 ]; then
  psql_admin() { psql -X -q -t -A -d postgres "$@"; }
  crear_base() { createdb -T template0 "$base_nueva"; }
  restaurar_base() { pg_restore --exit-on-error --single-transaction -d "$base_nueva"; }
else
  compose=(docker compose -f docker-compose.prod.yml --env-file .env.produccion)
  usuario=$(grep -E '^POSTGRES_USER=' .env.produccion | cut -d= -f2-)
  psql_admin() { "${compose[@]}" exec -T db psql -X -q -t -A -U "$usuario" -d postgres "$@"; }
  crear_base() { "${compose[@]}" exec -T db createdb -U "$usuario" -T template0 "$base_nueva"; }
  restaurar_base() { "${compose[@]}" exec -T db pg_restore -U "$usuario" --exit-on-error --single-transaction -d "$base_nueva"; }
fi

if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$base_nueva'")" = 1 ]; then
  echo "La base $base_nueva ya existe: elige un nombre nuevo." >&2
  exit 1
fi

crear_base
# Descifrado en memoria, directo a pg_restore: tampoco aquí queda una copia en claro en el disco.
descifrar "$copia_base" | restaurar_base
echo "Base restaurada en $base_nueva."

if [ -n "$copia_archivos" ]; then
  mkdir -p "$carpeta_nueva"
  chmod 700 "$carpeta_nueva"
  descifrar "$copia_archivos" | tar -C "$carpeta_nueva" -xzf -
  echo "Imágenes restauradas en $carpeta_nueva."
fi
