# Seguridad de Turnoo

Qué protege a Turnoo y qué comandos le tocan a quien lo opera. El detalle de cada control está en el código, con su prueba.

## Controles

| Control | Dónde | Prueba |
|---|---|---|
| Límite de peticiones en memoria: global 300/min por IP; aceptar invitación y restablecer 20/15 min por IP; cambiar contraseña 10/15 min por usuario; invitar, reenviar y recuperación 30/h por usuario; webhook 600/min en total, contado después de la firma. 429 JSON genérico con `Retry-After`. Respeta `SALTOS_PROXY`. | `backend/src/compartido/limite.ts`, `app.ts` | `pruebas/limite.test.ts` |
| Límite de intentos de login (cuenta+IP, cuenta, IP), en la base. | `auth.intentos.ts` | `pruebas/login.limite.test.ts` |
| CSP con nonce por petición (`'strict-dynamic'`, sin `'unsafe-eval'` en producción), HSTS (1 año, `includeSubDomains`), Permissions-Policy, `X-Frame-Options`, `nosniff`, `Referrer-Policy`. | `panel/proxy.ts`, `panel/lib/cabeceras.ts`, `panel/next.config.ts` | `panel/e2e/seguridad.spec.ts` |
| Registro de auditoría, solo para agregar (la app no puede cambiarlo ni borrarlo). Sin contraseñas, tokens, correos ni teléfonos; IP recortada a /24 o /48. | migración 018, `backend/src/modulos/auditoria/` | `pruebas/auditoria.test.ts` |
| Logs: contraseñas, tokens, cookies y `authorization` ocultos; teléfonos con sus 4 últimos dígitos, también dentro de un texto. | `backend/src/compartido/logger.ts` | `pruebas/logger.test.ts` |
| Archivos de clientes: tipo leído de los bytes, tamaño máximo, nombre uuid, fuera de lo público, permisos 0600; borrado al cumplir `RETENCION_IMAGENES_DIAS` (180). | `backend/src/modulos/adjuntos/`, `tareas.ts`, migración 019 | `pruebas/adjuntos.test.ts`, `pruebas/retencion.test.ts` |
| IA: el negocio y el cliente salen del contexto, nunca del modelo; RLS en cada consulta; solo funciones propias (`Object.hasOwn`); argumentos estrictos. | `backend/src/modulos/ia/ia.herramientas.ts` | `pruebas/ia.test.ts` (inyección de prompt); `npm run ia:evaluar` con el modelo real |
| Contraseñas filtradas (Pwned Passwords, k-anonimato), opcional, falla abierta. | `backend/src/compartido/contrasenas-filtradas.ts` | `pruebas/contrasenas-filtradas.test.ts` |
| Copias cifradas con gpg (llave pública en el servidor) y restauración en una base nueva. | `despliegue/respaldar.sh`, `despliegue/restaurar.sh` | `npm run respaldo:probar` |
| Secretos: gitleaks en cada commit (hook) y en CI sobre todo el historial. | `.githooks/pre-commit`, `.github/workflows/ci.yml` | — |
| Dependencias: Dependabot semanal (npm, docker, actions), CodeQL, `npm ci` y `npm audit` en CI. | `.github/` | — |

## Comandos que te tocan

```bash
# Hook de gitleaks en cada commit (una vez por copia del repositorio; requiere gitleaks en el PATH)
git config core.hooksPath .githooks

# Revisar todo el historial a mano
gitleaks git . --log-opts="--all" --redact

# Base de pruebas con las migraciones nuevas (018 y 019), y la tuya de desarrollo cuando quieras
cd backend && npm run db:pruebas
cd backend && npm run db:migrar

# Probar copias y restauración (no toca la base de desarrollo)
cd backend && npm run respaldo:probar
```

Variables nuevas (ya están en las plantillas `.env.example`):

- `RETENCION_IMAGENES_DIAS` (backend): días que se guarda cada imagen; 180 por defecto, 0 = nunca se borran.
- `REVISAR_CONTRASENAS_FILTRADAS` (backend): `true` para activar Pwned Passwords; apagada por defecto.
- `RESPALDO_GPG_DESTINATARIO` (`.env.produccion`): la huella de la llave pública de las copias.

## Secretos

gitleaks 8.30.1 revisó todo el historial (todas las ramas y los PR de GitHub, 210 commits) el 19 de noviembre de 2026: **sin hallazgos**, y en git solo hay plantillas `.env*.example`, nunca un `.env` real. No hay nada que rotar por una filtración en el repositorio. Antes de exponer Turnoo, igual conviene que los secretos de producción sean nuevos y distintos de los de desarrollo:

| Secreto | Cómo se rota |
|---|---|
| `POSTGRES_PASSWORD`, `TURNOO_APP_PASSWORD` | `ALTER ROLE … PASSWORD '…'` y el `.env` correspondiente. |
| `WHATSAPP_APP_SECRET` | En Meta (App > Configuración > Básica > Restablecer). |
| `WHATSAPP_VERIFY_TOKEN` | Uno nuevo (`openssl rand -hex 32`) en `.env` y en la configuración del webhook en Meta. |
| `OPENAI_API_KEY` | En OpenAI: crea una nueva, cámbiala y revoca la vieja. |
| Tokens de acceso de Meta de cada número | En Meta, y se vuelven a guardar desde el superadmin (se cifran solos). |
| `CLAVE_CIFRADO_TOKENS` | **Cuidado:** cifra los tokens de Meta guardados. Cambiarla sin volver a guardar cada token deja los números sin poder enviar. Solo si se filtró, y luego vuelve a registrar cada token. |

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
