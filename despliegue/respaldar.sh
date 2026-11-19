#!/usr/bin/env bash
# Copia de seguridad CIFRADA de la base y de las imágenes de los clientes (ARCHIVOS_DIR).
# Se corre desde cualquier carpeta, en el servidor:
#   ./despliegue/respaldar.sh
# Deja dos archivos por fecha en backups/ y borra los de más de DIAS_RETENCION días (14 por defecto):
#   backups/turnoo-AAAAMMDDTHHMMSSZ.dump.gpg     (pg_dump en formato custom)
#   backups/archivos-AAAAMMDDTHHMMSSZ.tar.gz.gpg (la carpeta de imágenes)
#
# Cifrado con gpg y una LLAVE PÚBLICA: el servidor puede cifrar, pero no abrir las copias. La
# llave privada vive fuera del servidor (ver docs/SEGURIDAD.md). El volcado pasa directo de
# pg_dump a gpg: nunca queda una copia sin cifrar en el disco.
#
# Variables:
#   RESPALDO_GPG_DESTINATARIO  huella de la llave pública (obligatoria; también se lee de .env.produccion)
#   DIAS_RETENCION             días que se guardan las copias (14)
#   RESPALDO_LOCAL=1           usa pg_dump y tar de este equipo en vez de los contenedores; la
#                              conexión sale de PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE,
#                              y las imágenes de ARCHIVOS_DIR.
# Son datos personales: la carpeta backups/ nunca se sube a GitHub (está en .gitignore).
set -euo pipefail

cd "$(dirname "$0")/.."
DIAS_RETENCION="${DIAS_RETENCION:-14}"
DESTINO="${RESPALDO_DIR:-backups}"

# Un valor de .env.produccion, sin cargar el resto del archivo en el entorno.
de_env_produccion() {
  [ -f .env.produccion ] && grep -E "^$1=" .env.produccion | cut -d= -f2- || true
}

destinatario="${RESPALDO_GPG_DESTINATARIO:-$(de_env_produccion RESPALDO_GPG_DESTINATARIO)}"
if [ -z "$destinatario" ]; then
  echo "Falta RESPALDO_GPG_DESTINATARIO (la huella de la llave pública de las copias). Ver docs/SEGURIDAD.md." >&2
  exit 1
fi
cifrar() {
  # --trust-model always: la llave se importó a propósito para esto; no hay red de confianza.
  gpg --batch --yes --quiet --trust-model always --encrypt --recipient "$destinatario" --output "$1"
}

if [ "${RESPALDO_LOCAL:-0}" = 1 ]; then
  volcar_base() { pg_dump -Fc; }
  volcar_archivos() { tar -C "$(dirname "$ARCHIVOS_DIR")" -czf - "$(basename "$ARCHIVOS_DIR")"; }
else
  compose=(docker compose -f docker-compose.prod.yml --env-file .env.produccion)
  usuario=$(de_env_produccion POSTGRES_USER)
  base=$(de_env_produccion POSTGRES_DB)
  volcar_base() { "${compose[@]}" exec -T db pg_dump -U "$usuario" -d "$base" -Fc; }
  volcar_archivos() { "${compose[@]}" exec -T api tar -C /datos -czf - archivos; }
fi

fecha=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p "$DESTINO"
base_cifrada="$DESTINO/turnoo-$fecha.dump.gpg"
archivos_cifrados="$DESTINO/archivos-$fecha.tar.gz.gpg"

# .tmp hasta terminar: si algo falla a mitad, no queda una copia rota con nombre de copia buena.
trap 'rm -f "$base_cifrada.tmp" "$archivos_cifrados.tmp"' EXIT
volcar_base | cifrar "$base_cifrada.tmp"
mv "$base_cifrada.tmp" "$base_cifrada"
volcar_archivos | cifrar "$archivos_cifrados.tmp"
mv "$archivos_cifrados.tmp" "$archivos_cifrados"

find "$DESTINO" -maxdepth 1 -type f \( -name 'turnoo-*.dump.gpg' -o -name 'archivos-*.tar.gz.gpg' \) -mtime +"$DIAS_RETENCION" -delete
echo "Copia cifrada lista: $base_cifrada y $archivos_cifrados"
