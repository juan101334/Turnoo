# Despliegue de Turnoo

Cómo poner el backend en un servidor con HTTPS. Todo corre en Docker con `docker-compose.prod.yml`:

| Servicio | Qué hace |
|---|---|
| `db` | PostgreSQL 17. Sin puertos abiertos: solo la ven los otros contenedores. |
| `herramientas` | Aplica las migraciones pendientes y termina. También corre los scripts del superadmin. |
| `api` | El backend compilado. Arranca solo si las migraciones terminaron bien. |
| `caddy` | Recibe el tráfico en los puertos 80 y 443, saca y renueva el certificado de HTTPS y lo pasa a la API. |

Volúmenes: `pgdata` (la base), `archivos` (imágenes de los clientes), `caddy_data` y `caddy_config` (certificados). El proyecto se llama `turnoo-prod`, distinto del de desarrollo: probarlo en tu equipo no toca la base de desarrollo.

Archivos de configuración, que se crean en el servidor y **nunca se suben a GitHub**:

- `.env.produccion` (raíz), a partir de `.env.produccion.example`: administrador de PostgreSQL, contraseña del rol `turnoo_app` y dominio de la API.
- `backend/.env.produccion`, a partir de `backend/.env.produccion.example`: Meta, OpenAI, clave de cifrado y dirección del panel.

`NODE_ENV=production`, `SALTOS_PROXY=1`, `ARCHIVOS_DIR=/datos/archivos` y `DATABASE_URL` los fija el compose, para que no dependan de lo que diga el archivo.

Todos los comandos se escriben desde la raíz del repositorio. Para no repetir, en esta guía:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.produccion'
```

## Probar en tu equipo

Con `DOMINIO_API=localhost`, Caddy usa un certificado propio en vez de Let's Encrypt.

1. Crea los dos archivos de configuración con valores de prueba (contraseñas nuevas, no las de desarrollo).
2. Sigue los pasos 4 a 6 de "Primer despliegue", con `sudo` delante de `docker` si tu usuario no está en el grupo `docker`.
3. Comprueba: `curl -k https://localhost/salud` debe responder `{"estado":"ok"}`.
4. Para borrarlo todo, incluida la base de prueba: `dc down -v`. **`-v` borra los volúmenes**: en el servidor nunca se usa.

Si los puertos 80 o 443 de tu equipo están ocupados, Caddy no arranca; los demás servicios sí.

## Primer despliegue

1. **Servidor.** Un VPS con Ubuntu 24.04 y al menos 2 GB de RAM. Entrada por SSH con llave, sin contraseña. Cortafuegos con solo los puertos 22, 80 y 443 abiertos (`ufw allow OpenSSH`, `ufw allow 80`, `ufw allow 443`, `ufw enable`). Instala Docker con su guía oficial para Ubuntu.
2. **DNS.** En el registrador del dominio, un registro `A` de `api` (`api.turnooapp.com`) con la IP del servidor. Comprueba que ya apunta con `dig +short api.turnooapp.com` antes de arrancar Caddy: si no apunta, Let's Encrypt rechaza el certificado y, tras varios intentos, bloquea el dominio por un rato.
3. **Código y configuración.** Clona el repositorio en el servidor y crea `.env.produccion` y `backend/.env.produccion` a partir de los ejemplos. Genera cada contraseña con `openssl rand -hex 24` y la clave de cifrado con `openssl rand -base64 32`. Guarda una copia de los dos archivos en un gestor de contraseñas: las copias de seguridad no los incluyen.
4. **Base y migraciones.**
   ```bash
   dc up -d db
   dc build
   dc run --rm herramientas
   ```
   La primera migración crea el rol `turnoo_app`, todavía sin contraseña.
5. **Contraseña del rol de la aplicación.** Escribe la misma que pusiste en `TURNOO_APP_PASSWORD`:
   ```bash
   dc exec db psql -U turnoo_admin -d turnoo -c '\password turnoo_app'
   ```
6. **Arrancar todo.**
   ```bash
   dc up -d
   dc ps                  # api "healthy" y caddy "running"
   curl https://api.turnooapp.com/salud
   ```
7. **Superadmin.** Imprime el enlace de invitación (con `PANEL_URL`); mientras no exista el panel, el token del enlace se acepta con la API, igual que en desarrollo:
   ```bash
   dc run --rm herramientas ./node_modules/.bin/tsx scripts/crear-superadmin.ts correo@dominio.com "Nombre Apellido"
   ```
   Si algún día se pierde el acceso: `scripts/recuperar-superadmin.ts correo@dominio.com`, igual.
8. **Meta.** En la app de Meta, cambia la URL del webhook a `https://api.turnooapp.com/webhooks/whatsapp` con el mismo token de verificación de `backend/.env.produccion`.
9. **Copias de seguridad automáticas** (sección siguiente).

## Copias de seguridad

`./despliegue/respaldar.sh` deja en `backups/` la base (`turnoo-FECHA.dump`) y las imágenes de los clientes (`archivos-FECHA.tar.gz`), y borra las de más de 14 días (`DIAS_RETENCION`). Para que corra todas las noches a las 3:00 (UTC), con `crontab -e`:

```
0 3 * * * cd /ruta/a/Turnoo && ./despliegue/respaldar.sh >> backups/respaldo.log 2>&1
```

Una copia que vive en el mismo servidor se pierde con el servidor. Antes de tener clientes reales, hay que copiar `backups/` a otro lugar (otro proveedor o un almacenamiento en la nube) de forma automática.

**Restaurar** (borra lo que haya en la base y lo reemplaza por la copia; para el servidor nuevo, primero haz los pasos 1 a 5):

```bash
dc stop api
dc exec -T db pg_restore -U turnoo_admin -d turnoo --clean --if-exists < backups/turnoo-FECHA.dump
dc run --rm --no-deps -v turnoo-prod_archivos:/datos/archivos --entrypoint tar herramientas \
  -C /datos -xzf - < backups/archivos-FECHA.tar.gz
dc up -d
```

El rol `turnoo_app` no viaja en la copia (es de todo el servidor de PostgreSQL): por eso, en un servidor nuevo, las migraciones del paso 4 lo crean antes de restaurar.

## Actualizar

```bash
./despliegue/respaldar.sh
git pull
dc up -d --build
```

`up` vuelve a correr `herramientas`: aplica las migraciones nuevas y, si alguna falla, la API nueva no arranca. Revisa con `dc logs herramientas` y `dc logs api`.

## Registros

Cada contenedor guarda hasta 5 archivos de 10 MB. `dc logs -f api` los muestra en vivo.
