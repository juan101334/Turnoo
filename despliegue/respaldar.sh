#!/usr/bin/env bash
# Copia de seguridad de la base y de las imágenes de los clientes (ARCHIVOS_DIR).
# Se corre desde la raíz del repositorio, en el servidor:
#   ./despliegue/respaldar.sh
# Deja dos archivos por fecha en backups/ y borra los de más de DIAS_RETENCION días.
# Son datos personales: la carpeta backups/ nunca se sube a GitHub (está en .gitignore).
set -euo pipefail

cd "$(dirname "$0")/.."
DIAS_RETENCION="${DIAS_RETENCION:-14}"
compose=(docker compose -f docker-compose.prod.yml --env-file .env.produccion)

# Usuario y base de .env.produccion, sin cargar el resto del archivo en el entorno.
usuario=$(grep -E '^POSTGRES_USER=' .env.produccion | cut -d= -f2-)
base=$(grep -E '^POSTGRES_DB=' .env.produccion | cut -d= -f2-)
fecha=$(date -u +%Y%m%dT%H%M%SZ)

umask 077
mkdir -p backups

# Formato custom de pg_dump: comprimido y se restaura con pg_restore.
"${compose[@]}" exec -T db pg_dump -U "$usuario" -d "$base" -Fc > "backups/turnoo-$fecha.dump.tmp"
mv "backups/turnoo-$fecha.dump.tmp" "backups/turnoo-$fecha.dump"

"${compose[@]}" exec -T api tar -C /datos -czf - archivos > "backups/archivos-$fecha.tar.gz.tmp"
mv "backups/archivos-$fecha.tar.gz.tmp" "backups/archivos-$fecha.tar.gz"

find backups -maxdepth 1 -type f \( -name 'turnoo-*.dump' -o -name 'archivos-*.tar.gz' \) -mtime +"$DIAS_RETENCION" -delete
echo "Copia lista: backups/turnoo-$fecha.dump y backups/archivos-$fecha.tar.gz"
