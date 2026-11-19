# Seguridad de Turnoo

Qué protege a Turnoo y qué comandos le tocan a quien lo opera. El detalle de cada control está en el código, con su prueba.

## Copias de seguridad cifradas

`despliegue/respaldar.sh` cifra con **gpg y una llave pública**. El servidor (o el PC que expone Turnoo) solo tiene la llave pública: puede cifrar, pero no abrir las copias. La llave privada vive en otro lugar (un USB guardado, un gestor de contraseñas, otro computador). Si alguien se lleva el servidor, se lleva copias que no puede leer.

### Generar la llave (una sola vez, en TU computador, no en el servidor)

```bash
gpg --quick-gen-key 'Copias Turnoo <copias@turnooapp.com>' default default never
gpg --list-keys --with-colons 'Copias Turnoo' | awk -F: '/^fpr/ {print $10; exit}'   # la huella, 40 caracteres
gpg --export --armor 'Copias Turnoo' > copias-turnoo-publica.asc                      # esto sí va al servidor
gpg --export-secret-keys --armor 'Copias Turnoo' > copias-turnoo-PRIVADA.asc          # esto NUNCA va al servidor
```

Te pide una frase: elige una larga y guárdala aparte. Guarda `copias-turnoo-PRIVADA.asc` fuera del servidor (al menos en dos lugares) y bórrala del computador donde la generaste si ese no es uno de ellos. Sin esa llave y su frase, las copias no se pueden abrir: perderla es perder las copias.

### En el servidor

```bash
gpg --import copias-turnoo-publica.asc
# En .env.produccion:
RESPALDO_GPG_DESTINATARIO=<la huella de 40 caracteres>
./despliegue/respaldar.sh      # prueba manual; luego el cron de docs/DESPLIEGUE.md
```

Si corres Turnoo en tu PC con PostgreSQL fuera de Docker, `RESPALDO_LOCAL=1` usa `pg_dump` del equipo; la conexión sale de `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` y `PGDATABASE`, y las imágenes de `ARCHIVOS_DIR`.

### Restaurar

En el equipo que tiene la llave privada (`gpg --import copias-turnoo-PRIVADA.asc`), siempre en una base y una carpeta nuevas:

```bash
./despliegue/restaurar.sh backups/turnoo-FECHA.dump.gpg turnoo_restaurada backups/archivos-FECHA.tar.gz.gpg ./archivos-restaurados
```

El script se niega a escribir sobre una base o carpeta que ya existe. `cd backend && npm run respaldo:probar` prueba el ciclo completo (respaldar, rotar, restaurar en `turnoo_restaurar_test`, comparar fila por fila y borrar) con una llave de prueba, sin tocar la base de desarrollo.

### Copiar las copias fuera del equipo

Una copia en el mismo disco se pierde con el disco. Como ya van cifradas, se pueden subir a cualquier lado sin exponer datos:

- **rclone** a un almacenamiento en la nube (Google Drive, Backblaze B2, S3). Una vez: `rclone config` (crea el remoto, por ejemplo `nube`). En el cron, después de respaldar:

  ```
  30 3 * * * cd /ruta/a/Turnoo && rclone copy backups/ nube:turnoo-backups --include '*.gpg' >> backups/respaldo.log 2>&1
  ```

  `copy` no borra lo que ya está en la nube: la rotación de 14 días es solo local. Pon una regla de vencimiento en el almacenamiento (por ejemplo, 90 días) para no guardar copias para siempre.
- **Disco externo**: `rsync -a --include='*.gpg' --exclude='*' backups/ /media/DISCO/turnoo-backups/`, y guárdalo lejos del PC.

Prueba restaurar una copia de la nube al menos una vez: una copia que nunca se restauró no está probada.
