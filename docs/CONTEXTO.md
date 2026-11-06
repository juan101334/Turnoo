# Contexto de Turnoo

> **Para quien retome el proyecto (persona o asistente de IA): lee este archivo primero.**
> Resume el negocio, las decisiones, el estado actual y el siguiente paso, para no tener que reconstruirlos.
> Detalle técnico completo: [ARQUITECTURA.md](ARQUITECTURA.md) y [CONVENCIONES.md](CONVENCIONES.md).
> Cómo correr cada parte: [README.md](../README.md) y [backend/README.md](../backend/README.md).
>
> **Última actualización:** sesión 5 (ver el registro al final). Quien trabaje en el proyecto
> debe actualizar este archivo al terminar cada sesión (sección 10).

## 1. Cómo se trabaja en este proyecto

**Quién:** Juan José, estudiante de Análisis y Desarrollo de Software (SENA), desarrollador junior.
Quiere que el proyecto sirva de portafolio en GitHub y que pueda generar ingresos. Se habla en español.

**Entorno:** Ubuntu (ThinkPad), Docker con `sudo docker`, Node 22 o superior.
Carpeta: `~/Escritorio/Trabajo/Proyectos/Turnoo`. Repositorio: `github.com/juan101334/Turnoo`.

**Preferencias de colaboración (importante respetarlas):**

- Definir las cosas con cuidado desde el inicio para evitar reformas. Hacer preguntas, mejor con opciones concretas, y explicar las decisiones de forma sencilla. Si algo no se entiende, explicarlo con un ejemplo.
- Cuando haya acceso a la carpeta, escribir los archivos directamente en ella y dar los comandos exactos para correr y para hacer commit.
- Verificar antes de entregar: compilar, correr las pruebas y, en lo importante, **romper algo a propósito** para comprobar que las pruebas detectan el error.
- Los comandos de Git y de npm se dan indicando desde qué carpeta se ejecutan (Git siempre desde la **raíz** del proyecto).
- Ser honesto con los riesgos (legales, de seguridad, de costos) sin imponer: es su decisión.
- Respetar las decisiones ya tomadas; si se quiere cambiar una, decirlo explícitamente.

**Flujo de Git:** una rama por tema (`feat/...`, `fix/...`, `docs/...`, `chore/...`), commits pequeños con el formato `tipo(ámbito): descripción en español`, subir la rama y fusionar a `main` con un pull request en GitHub (opción "Create a merge commit"). Nunca subir `.env`: se revisa `git status` antes de cada commit. Detalle en CONVENCIONES.md (sección 10).

## 2. Qué es Turnoo y por qué existe

Sistema de citas para **barberías y salones de belleza**. El cliente escribe al WhatsApp del negocio; una IA responde con información del negocio, muestra los horarios disponibles y agenda la cita. El negocio gestiona todo desde un panel web. Una misma aplicación atiende a varios negocios (SaaS), con los datos de cada uno completamente aislados. Meta: más de 5 negocios.

**Origen de la idea:** Juan José quería un proyecto útil para GitHub que generara ingresos. Se evaluaron muchas ideas (gestor de pedidos e inventario, bot de WhatsApp para pedidos, kit de laboratorios Docker/Linux, starter kit, sistema de reservas, generador de catálogos, monitor de servidores, facturación para freelancers, API de datos de Colombia, seguimiento de postulaciones, backups con panel, chatbot de FAQ). Se eligió combinar **bot de WhatsApp + IA + agendamiento de citas**, empezando por barberías por ser un negocio con mucha demanda de agendamiento.

**Dos tipos de cliente objetivo:**

- **Barbería de barrio:** uno o pocos barberos; el cliente escribe al número del negocio (muchas veces el del propio barbero). En el sistema es un negocio con un solo profesional, y la IA agenda directo sin preguntar con quién. Es un mercado sensible al precio.
- **Barbería consolidada:** varios barberos y un número de recepción. La IA hace de recepcionista.

## 3. Decisiones tomadas (resumen)

La tabla completa de decisiones de producto está en ARQUITECTURA.md, sección 3. Lo esencial:

**Tecnología:** Node.js 22 + TypeScript (módulos ES, imports con extensión `.js`) + Express 5 + SQL directo con `pg` (sin ORM). PostgreSQL 17 en Docker (puerto **5433** en el equipo de desarrollo). Panel en Next.js (aún no creado). Las tareas internas corren con un temporizador simple dentro de la API; Los mensajes para la IA se procesarán con una marca de pendiente en la conversación y `SKIP LOCKED`, sin pg-boss (decidido en la sesión 6). Despliegue en un VPS con Docker Compose y Caddy para HTTPS. Un solo repositorio con `backend/` y `panel/`.

**WhatsApp:** API oficial (Cloud API de Meta). Un número por negocio (`whatsapp_cuentas`); el modelo permite un número por barbero (`profesional_id` opcional) pero no se implementa en el MVP.

**Aislamiento entre negocios (la regla más importante):** `negocio_id` en toda tabla + Row Level Security forzado + claves foráneas compuestas `(negocio_id, id)`. La aplicación se conecta con el rol `turnoo_app` (sin superusuario, no puede saltarse el RLS). **Todo acceso a datos pasa por `conNegocio(negocioId, async (tx) => ...)`** (o `conSistema` para superadmin y tareas internas) en `backend/src/db/contexto.ts`. Solo dos consultas ocurren antes de conocer el negocio: `buscarCuentaWhatsapp` y `usuarioParaLogin` (`db/previas.ts`). Los tokens de sesión, invitación y recuperación llevan el negocio dentro (`<negocioId|sis>.<secreto>`), así que se consultan YA con `conNegocio` y sin más funciones que se salten el RLS.

**Agenda:**

- Cada barbero tiene su horario de trabajo (varios rangos por día, el almuerzo es el hueco), bloqueos (días libres, festivos, cierres del negocio) y **sus propios servicios**, con su duración y precio.
- Una cita es de **una persona**, con uno o varios servicios **del mismo barbero**; la duración total es la suma. Un cliente puede agendar varias citas seguidas.
- Una sede por negocio por ahora (el modelo ya soporta varias).
- Valores por defecto, configurables por negocio en `configuracion_negocio`: citas cada 15 min, anticipación mínima 1 h y máxima 30 días, máximo 2 citas activas por cliente, cancelar o reprogramar por WhatsApp hasta 2 h antes, recordatorio ~11 h antes.
- Los horarios se alinean al reloj (08:00, 08:15, ...) aunque la cita anterior termine a una hora "rara".

**Estados de la cita:** `por_aprobar`, `pendiente`, `confirmada` (fase 2), `completada`, `cancelada` (final), `no_asistio`. Un trigger de la base valida las transiciones. Una restricción de exclusión (`citas_sin_solapes`) impide citas dobles contando `por_aprobar`, `pendiente` y `confirmada`.

**Inasistencias:** el barbero marca "no asistió" con un toque; si no marca nada en 24 h la cita se completa sola. Con 3 inasistencias en 30 días del mismo cliente en ese negocio, sus citas nuevas quedan `por_aprobar`: reservan el hueco, el barbero tiene 2 h para aprobar (nunca más allá de 1 h antes de la cita) y si no responde se libera y se avisa al cliente. Las banderas son **por negocio**, no se comparten entre negocios (privacidad). Las inasistencias se cuentan desde las citas, no hay contador.

**IA:** habla solo de temas del negocio usando una base de conocimiento por negocio; si no sabe, deriva a una persona en lugar de inventar. Al derivar, la conversación pasa a `humano` (la IA calla), se avisa al dueño por WhatsApp con plantilla y vuelve sola a la IA a las 2 h. En el MVP no hay bandeja de chats: la persona contacta al cliente por fuera. **El backend, nunca la IA, pone el negocio y el cliente.** **Proveedor: OpenAI** (Juan José ya tiene saldo cargado), con el modelo en una variable de entorno y toda la llamada al proveedor en un solo archivo, para poder cambiarlo sin tocar el resto. Funciones de la IA: `listar_profesionales_y_servicios`, `consultar_disponibilidad`, `crear_cita`, `listar_mis_citas`, `cancelar_cita`, `reprogramar_cita`, `derivar_a_humano`. Los audios se transcriben (servicio aparte); las imágenes se guardan y se adjuntan a la cita.

**Recordatorio:** uno solo, ~11 h antes, con plantilla de WhatsApp (casi siempre cae fuera de la ventana de 24 h, así que tiene costo). No se envía de noche (07:00 a 21:00, valor propuesto que falta validar).

**Datos personales:** aviso de tratamiento de datos en el primer mensaje, que nombra a Meta y a OpenAI como terceros que reciben los datos; se entiende aceptado al seguir conversando (decisión de Juan José; se le advirtió del riesgo con la Ley 1581 de 2012 y que debe revisarse con un abogado). Se registra en `consentimientos`.

**Modelo de negocio:** cobro mensual por cantidad de barberos o de citas, prueba de 15 días, cobro **manual** en el MVP (estados `prueba` / `activo` / `suspendido`, tabla `pagos`). Turnoo asume los costos de WhatsApp, IA y transcripción: la mensualidad debe cubrirlos y dejar ganancia. Cada plan tendrá límites de barberos, citas al mes y conversaciones de IA al mes (al 80% se avisa al dueño; al 100% la IA deja de responder y deriva).

**Roles:** `superadmin` (Juan José, sin negocio), `dueno` y `empleado` (el barbero solo ve su agenda y gestiona sus servicios y horario). Bandeja de chats en la fase 2.

## 4. Estado actual

**Hecho y subido a GitHub:**

| Qué | Dónde |
|---|---|
| Base de datos PostgreSQL en Docker | `docker-compose.yml`, `.env.example` |
| Migración 001: 21 tablas, RLS, rol `turnoo_app`, funciones previas al contexto | `db/migrations/001_init.sql` |
| Migración 002: `por_aprobar`, transiciones, configuración de inasistencias y modo humano | `db/migrations/002_inasistencias_y_aprobacion.sql` |
| Guía del proyecto | `README.md`, `docs/ARQUITECTURA.md`, `docs/CONVENCIONES.md`, este archivo |
| Esqueleto del backend: configuración validada (zod), logger (pino), errores del dominio con traducción de errores de PostgreSQL, `/salud`, manejo central de errores | `backend/src/` |
| Aislamiento: `conNegocio`, `conSistema`, funciones previas | `backend/src/db/` |
| Utilidades de tiempo (Luxon) y validación | `backend/src/compartido/tiempo.ts`, `validacion.ts` |
| Módulo de disponibilidad: cálculo puro + servicio `consultarDisponibilidad` | `backend/src/modulos/citas/` |
| Crear, cancelar, reprogramar, aprobar/rechazar y marcar citas (`crearCita`, `cancelarCita`, `reprogramarCita`, `aprobarCita`, `rechazarCita`, `marcarCita`) con todas las reglas de la sección 5 | `backend/src/modulos/citas/citas.servicio.ts` |
| **599 pruebas automáticas en verde** (85 + 28 de gestión de citas + 18 de autenticación + 8 de clientes + 12 de rutas de citas + 31 de negocios + 46 de barberos y usuarios + 57 de servicios, horarios y bloqueos + 59 de rutas de clientes + 33 del límite de login + 35 de tareas internas + 56 del webhook + 52 del envío por WhatsApp + 16 de clientes por BSUID + 16 del aviso de datos + 26 del procesador de conversaciones + 21 de la base de conocimiento) contra una base `turnoo_test` aparte | `backend/pruebas/` |
| Agenda de cada barbero: servicios y horarios por `/profesionales/:id/...`, y bloqueos por `/bloqueos`. Crear un bloqueo o quitar un horario devuelve las citas afectadas, sin tocarlas | `backend/src/modulos/profesionales/agenda.*` |
| Barberos: el dueño los crea (respetando el límite del plan), renombra, desactiva, reactiva y asocia a un usuario por `/profesionales`; el empleado solo consulta el suyo | `backend/src/modulos/profesionales/` |
| Usuarios: listar, desactivar y reenviar invitación por `/auth/usuarios`. Invitar a un empleado exige su barbero. Solo una invitación activa a un usuario | `backend/src/modulos/auth/` |
| Negocios: el superadmin los crea (en prueba por 15 días), los lista y cambia plan y estado por `/negocios`; el dueño consulta y edita su negocio y su configuración por `/negocio`. Un negocio suspendido solo inicia sesión y consulta | `backend/src/modulos/negocios/` |
| Clientes: `obtenerOCrearCliente` (busca por teléfono, lo crea si no existe, atómico) y `normalizarTelefono` (deja el formato de WhatsApp; a un celular colombiano de 10 dígitos le agrega el 57). Lo reutilizará el webhook | `backend/src/modulos/clientes/` |
| Rutas HTTP de citas para el panel: `GET /citas` (rango, barbero, estado), `GET /citas/:id`, `GET /citas/disponibilidad`, `POST /citas` (con `cliente:{telefono,nombre}`), `POST /citas/:id/{cancelar,reprogramar,aprobar,rechazar,marcar}`. Dos roles: el dueño maneja todo el negocio; el empleado solo las citas de SU barbero (`profesionales.usuario_id`) | `backend/src/modulos/citas/citas.rutas.ts` |
| Migración 003: tabla `sesiones` y RLS en `tokens_usuario` | `db/migrations/003_sesiones.sql` |
| Migración 007: `mensajes.media_id`, para descargar audios e imágenes después | `db/migrations/007_media_id_mensajes.sql` |
| Webhook de WhatsApp en `/webhooks/whatsapp`: verificación de la URL (`GET`) y recepción (`POST`) con firma `X-Hub-Signature-256` sobre el cuerpo sin procesar. Guarda cliente, conversación y mensaje en una transacción, sin duplicar reenvíos, e ignora negocios suspendidos. Vuelve a la IA al vencer el modo humano. **Probado con WhatsApp real el 5 de noviembre de 2026, solo con mensajes de texto** (ver sección 6.1) | `backend/src/modulos/whatsapp/` |
| Envío de mensajes de texto por WhatsApp (`enviarMensaje`): exige la ventana de 24 h, guarda el mensaje saliente antes de enviarlo y anota `enviado` o `fallido`. Aún no lo llama nada: lo usará la IA | `backend/src/modulos/whatsapp/whatsapp.envio.ts` |
| Cuentas de WhatsApp: el superadmin las registra, lista y cambia por `/negocios/:id/whatsapp`. El token de Meta se guarda cifrado con AES-256-GCM (clave en `CLAVE_CIFRADO_TOKENS`) y nunca se devuelve | `backend/src/modulos/whatsapp/whatsapp.cuentas.ts`, `backend/src/compartido/cifrado.ts` |
| Migración 008: `clientes.wa_user_id` (BSUID de WhatsApp, único por negocio). Un cliente vigente necesita teléfono o BSUID; uno anonimizado, ninguno | `db/migrations/008_clientes_bsuid.sql` |
| Clientes por BSUID: el webhook acepta mensajes sin teléfono (personas con nombre de usuario de WhatsApp) y reconoce al mismo cliente por su BSUID. Un número reciclado (mismo teléfono, otro BSUID) crea un cliente nuevo, para que la persona nueva no vea lo de la anterior. El envío usa `recipient` cuando no hay teléfono | `backend/src/modulos/clientes/clientes.repositorio.ts` (`obtenerOCrearPorWhatsapp`) |
| Migración 009: `clientes.aviso_datos_version`, `aviso_datos_enviado_en` y `aviso_datos_pedido_en` (reserva para no enviar el aviso dos veces) | `db/migrations/009_aviso_datos.sql` |
| Aviso de tratamiento de datos (versión `2026-11-v1`, **pendiente de revisión legal**): el primer mensaje de un cliente lo pide y se envía después de responder a Meta. Un mensaje escrito después de que Meta confirmó el aviso registra el consentimiento con su `wa_message_id`. Si el envío falla, se reintenta con el siguiente mensaje | `backend/src/modulos/whatsapp/whatsapp.aviso.ts` |
| Migración 010: columnas `ia_*` en `conversaciones` (pendiente, reserva, intentos) e índice de pendientes | `db/migrations/010_conversaciones_pendientes.sql` |
| Procesador de conversaciones: el webhook marca pendiente la conversación de quien ya aceptó el aviso; el procesador la reserva con `SKIP LOCKED`, responde 5 s después del último mensaje (o 30 s después del primero), reintenta a los 30 s, 1 y 2 min, y luego deriva con motivo `error` y avisa al cliente. Descarta lo que está en modo humano o lleva 24 h. **Aún no se inicia en `index.ts`: lo conecta la IA (punto 5)** | `backend/src/procesador/` |
| Base de conocimiento: el dueño lista, crea, edita, activa o desactiva y borra preguntas con su respuesta por `/conocimiento`. Topes: pregunta de 300 caracteres, respuesta de 2.000, 200 entradas y 20.000 caracteres entre las activas, porque todas van en cada llamada a la IA. No admite dos preguntas iguales (sin distinguir mayúsculas) | `backend/src/modulos/conocimiento/` |
| Migración 006: `citas.cancelada_por` admite `sistema` | `db/migrations/006_cancelada_por_sistema.sql` |
| Tareas internas, al arrancar y cada minuto: expirar `por_aprobar` vencidas (liberan el hueco), autocompletar citas pasadas `horas_autocompletar_cita` desde su fin (hasta 500 por ciclo cada una) y limpiar `intentos_login` vencidos | `backend/src/tareas/` |
| Migración 005: tabla `intentos_login`, visible solo en el contexto de sistema | `db/migrations/005_intentos_login.sql` |
| Límite de intentos de login: 5 por cuenta e IP, 20 por cuenta y 30 por IP, en ventanas de 15 minutos; responde 429 con `Retry-After`. `SALTOS_PROXY` define de dónde sale la IP real | `backend/src/modulos/auth/auth.intentos.ts` |
| Migración 004: `clientes.telefono` admite NULL solo si el cliente está anonimizado | `db/migrations/004_anonimizar_clientes.sql` |
| Rutas `/clientes` para el panel: `GET /` (búsqueda por nombre o teléfono, paginada con `limite`, `desplazamiento` y `hayMas`), `GET /:id`, `PATCH /:id` y `POST /:id/anonimizar`. El dueño ve todo el negocio; el empleado, los clientes con citas de su barbero | `backend/src/modulos/clientes/clientes.rutas.ts` |
| Autenticación: login con argon2, sesiones en la base (7 días, revocables), invitaciones (72 h) y recuperación (1 h) con enlace de un solo uso, roles; rutas `/auth/*` | `backend/src/modulos/auth/` |
| Script del primer superadmin: `npm run superadmin -- correo "Nombre"` (imprime el enlace para fijar la contraseña) | `backend/scripts/crear-superadmin.ts` |

**No existe todavía:**

- Integración de la IA, panel, despliegue y envío de correo.
- Del webhook falta: descarga de audios e imágenes y estados de entrega (los `statuses` de Meta).
- Del envío falta: plantillas (fuera de la ventana de 24 h) y la prueba con WhatsApp real.
- Tareas con WhatsApp: recordatorios, avisos de derivación y avisos al cliente.
- Creación de planes: la tabla `planes` sigue vacía a propósito (sección 7), así que hoy solo se puede asignar un plan creado con SQL.
- CORS en `app.ts`: hace falta para el panel.

**Huecos conocidos del código actual** (los corrige el plan de la sección 6.1, salvo que se indique otra cosa):

- Un negocio suspendido no puede anonimizar a un cliente con citas futuras activas, porque tampoco puede cancelarlas (las pasadas ya las resuelven las tareas internas). Hoy hace falta que el superadmin lo reactive un momento.
- **Los avisos al cliente por citas vencidas quedan pendientes hasta que exista el envío de mensajes.** Hoy, cuando una cita `por_aprobar` vence, el cliente no se entera. Cuando exista el aviso, no debe escribirle a las citas que ya vencieron antes: hay que filtrarlas por `cancelada_en` o por una marca de aviso enviado.
- El texto del aviso de datos (versión `2026-11-v1`) está pendiente de revisión legal. **No conectar clientes reales hasta que esté revisado.** Si el texto cambia, debe cambiar también `VERSION_AVISO`, para que cada cliente lo reciba de nuevo.
- Si el proceso se cae justo después de enviar el aviso y antes de anotarlo, el cliente puede recibirlo dos veces: la reserva vence a los 2 minutos y el siguiente mensaje lo vuelve a pedir.
- **Clientes por BSUID:** un cliente creado desde el panel solo con teléfono que después escribe sin teléfono aparece como cliente nuevo. Es poco probable: Meta incluye el teléfono si hubo mensajes con ese número en los últimos 30 días. No se ha probado con WhatsApp real un mensaje sin teléfono, ni el envío por `recipient`; la documentación de Meta no dice si depende de la versión v27.0.
- Si Meta reenvía un mensaje ya guardado de un cliente que se anonimizó entretanto, se crea un cliente nuevo con ese teléfono. Es muy poco probable, porque Meta solo reenvía cuando no recibió el 200.
- Anonimizar no borra archivos, porque todavía nada los guarda. Cuando el webhook guarde imágenes o audios (`mensajes.archivo_ruta`), anonimizar también debe borrar esos archivos.
- `prueba_hasta` y `pagado_hasta` solo se guardan: vencerlos no suspende el negocio. Por ahora la suspensión es manual, coherente con el cobro manual del MVP; esto no está en el plan.

**Comandos habituales** (desde `backend/`):

```bash
npm run dev           # servidor con recarga
npm run typecheck     # tipos de todo el código, pruebas incluidas
npm run db:pruebas    # recrea turnoo_test aplicando todas las migraciones (tras cada migración nueva)
npm test              # 599 pruebas
```

Aplicar una migración nueva a la base de desarrollo (desde la raíz):

```bash
sudo docker exec -i turnoo-db psql -U turnoo_admin -d turnoo -v ON_ERROR_STOP=1 < db/migrations/NNN_nombre.sql
```

## 5. Reglas de crear, cancelar, reprogramar y aprobar citas (HECHO en la sesión 2)

> Ya implementado y probado. Se conserva como referencia de las reglas. **El siguiente paso está en la sección 6.2.**

Es el segundo tramo del módulo `backend/src/modulos/citas/`. Todo dentro de **una transacción** con `conNegocio`, con la lógica en el servicio y el SQL en el repositorio. Lista de reglas que debe aplicar, en orden:

**Crear cita** (`crearCita`):

1. Validar la entrada (uuids, fecha de inicio, servicios) y que el negocio no esté `suspendido`.
2. Leer la configuración del negocio, el barbero activo y los servicios (copiar nombre, duración y precio a `cita_servicios`; `precio_total_cop` = suma).
3. Verificar que `inicio` sea un hueco válido reutilizando `calcularHuecos` (misma lógica que la disponibilidad). La restricción de la base sigue siendo la garantía final ante dos clientes simultáneos: el error `23P01` ya se traduce a `HorarioNoDisponible`.
4. Límite de citas activas del cliente (`max_citas_activas_cliente`; `NULL` = sin límite). Cuentan `por_aprobar`, `pendiente` y `confirmada` que aún no terminaron.
5. Inasistencias: contar `no_asistio` del cliente en la ventana del negocio; si llega al umbral, la cita nace `por_aprobar` con `aprobacion_expira_en = min(ahora + horas_espera_aprobacion, inicio - aprobacion_minutos_antes_cita)`.
6. Límites del plan (`planes` + `uso_mensual`): citas del mes. `plan_id` nulo = sin límites.
7. Insertar la cita y sus servicios, e incrementar `uso_mensual` (upsert por negocio y mes).

**Cancelar:** el cliente solo hasta `horas_limite_cancelacion` antes; el negocio siempre. Guarda `cancelada_por` y `cancelada_en`. El aviso al cliente por WhatsApp lo envía una tarea, no el servicio.

**Reprogramar:** cambia `inicio` y `fin` de la misma cita, reinicia `recordatorio_enviado_en` y revalida la disponibilidad **excluyendo la propia cita** (parámetro `excluirCitaId`). Mismas reglas de plazo que cancelar.

**Aprobar o rechazar** (`por_aprobar`): aprobar pasa a `pendiente` y limpia `aprobacion_expira_en`; rechazar pasa a `cancelada` con `cancelada_por = 'negocio'`.

**Marcar** `completada` o `no_asistio`: solo el negocio. El autocompletado lo hace una tarea interna, y el resultado se puede corregir a `no_asistio` después.

**Decidido en la sesión 2:** si una cita `por_aprobar` no alcanza el margen mínimo (el plazo calculado ya pasó), se rechaza con el mensaje de que debe comunicarse con el negocio.

Cada regla necesita su prueba (en `backend/pruebas/`) y, para las más importantes, una verificación de que la prueba falla si se rompe la regla.

## 6. Hoja de ruta

1. **MVP (en curso):** multi-negocio con login y roles, webhook seguro, IA con funciones, servicios, barberos y horarios, panel básico de citas, recordatorio, derivación con aviso al dueño, conteo de uso y límites por plan.
2. **Fase 2:** bandeja de chats, botones de confirmar o cancelar en el recordatorio, lista de espera, ficha del cliente.
3. **Fase 3:** pagos o anticipos con pasarela (por ejemplo Wompi), reactivación de clientes, reseñas y métricas.

Ya hecho del MVP: citas (crear, cancelar, reprogramar, aprobar, con sus rutas HTTP), autenticación y usuarios. Orden de lo que falta: rutas de administración → límite de intentos de login → tareas internas → webhook de WhatsApp (firma `X-Hub-Signature-256` sobre el cuerpo sin procesar, idempotencia por `wa_message_id`, cola) → integración de la IA con sus funciones → tareas con WhatsApp (recordatorios, avisos de derivación y aviso de aprobaciones vencidas) → panel Next.js → despliegue con backups.

El regreso del modo humano **no es una tarea**: se evalúa cuando llega el siguiente mensaje (ARQUITECTURA.md, sección 7).

### 6.1 Plan acordado y siguiente paso (sesión 5)

Una rama y un pull request por punto, con el flujo de la sección 1:

0. Actualizar la documentación.
1. Negocios y su configuración.
2. Barberos y usuarios: asignar, desactivar, reenviar invitación y la corrección de la reactivación.
3. Servicios, horarios y bloqueos.
4. Clientes.
5. Límite de intentos de login (exige configurar `trust proxy` para ver la IP real).
6. Tareas internas: autocompletar citas, expirar `por_aprobar` y limpiar `intentos_login` vencidos.
7. Webhook de WhatsApp.

**Estado:** puntos 0 a 7 hechos y webhook probado con WhatsApp real. Sigue el plan de la sección 6.2.

**Conectar una cuenta de WhatsApp al webhook:**

1. `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` en `backend/.env`. Se configuran una vez por app de Meta, no por negocio.
2. URL pública con HTTPS, terminada en `/webhooks/whatsapp`, configurada en WhatsApp > Configuración de la app de Meta, con el mismo token de verificación. En desarrollo sirve un túnel: `cloudflared tunnel --url http://localhost:3000`. Expone toda la API, así que se cierra al terminar, y al reabrirlo la dirección cambia.
3. Suscripción al campo `messages`, el único que Turnoo procesa. El botón Test de Meta confirma el túnel y la firma: usa el número ficticio `123456123`, así que la API registra "cuenta de WhatsApp desconocida" y no guarda nada.
4. Registrar la cuenta con `POST /negocios/:id/whatsapp` (sesión de superadmin): `phoneNumberId`, `wabaId`, `numeroVisible` y `token`. El token debe ser permanente (de un usuario del sistema de Meta): el temporal del panel vence en horas. Requiere `CLAVE_CIFRADO_TOKENS` en `backend/.env`; si esa clave se pierde, hay que volver a registrar el token de cada cuenta con `PATCH /negocios/:id/whatsapp/:cuentaId`.
5. **Suscribir la app a la cuenta de WhatsApp Business (WABA).** Sin este paso, la prueba del paso 3 funciona, pero Meta no envía los mensajes reales. Se hace una vez por cuenta, con un token de acceso de la app:

```bash
curl -s -X POST "https://graph.facebook.com/v27.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <TOKEN>"
```

Con `GET` a la misma dirección se confirma que la app aparece en la lista. Que aparezca `WA DevX Webhook Events 1P App` no basta: esa app la tenía la cuenta antes de suscribir la nuestra.

**Prueba real del aviso de datos (5 de noviembre de 2026).** El primer mensaje recibió el aviso, que llegó al celular, y quedó un saliente `sistema | enviado` sin reserva colgada y sin consentimiento. El segundo mensaje registró el consentimiento `2026-11-v1` con su hora según Meta, sin enviar otro aviso. Meta ya envía el BSUID: el cliente, que tenía solo teléfono, lo recibió sin duplicarse. El envío a Meta tardó unos 6 s, con un tiempo máximo de 10 s: si se repite, conviene subirlo. Falta probar con WhatsApp real el envío por `recipient`.

**Prueba real del 5 de noviembre de 2026.** Con el número de prueba de Meta, se enviaron dos mensajes de texto desde un celular propio. Quedaron guardados en la base de desarrollo con su `wamid`, un solo cliente con teléfono y nombre, una sola conversación, ningún consentimiento, y el log no mostró teléfono ni texto. Falta probar con WhatsApp real: audios, imágenes y reenvíos de Meta.

Decisiones ya tomadas para estos puntos:

- **Superadmin:** crea el negocio, invita al dueño y cambia plan y estado. No opera barberos ni agenda. Puede invitar y generar recuperación en un negocio suspendido, para ayudar a recuperar el acceso.
- **Mi negocio:** `/negocio` es solo del dueño; el empleado no ve la configuración ni los datos del plan. El negocio sale siempre de la sesión, nunca de la URL.
- **Asociar usuario y barbero:** invitar a un empleado exige `profesionalId`, en la misma transacción. Una ruta aparte vincula o cambia el usuario de un barbero, y sirve también para un dueño que atiende.
- **Alcance del empleado:** sus servicios, su horario y sus propios bloqueos. Los bloqueos de todo el negocio son solo del dueño.
- **Clientes:** el empleado ve solo los que tienen citas con su barbero. Solo el dueño edita o anonimiza.
- **Webhook:** responde después de guardar, no antes: si la base falla responde 500 y Meta reenvía, así que un mensaje confirmado nunca se pierde. Por eso no hizo falta una cola. Un dato que nunca servirá (teléfono inválido, cuerpo que no es JSON) responde 200, porque reenviarlo no lo arregla. Un evento con varios mensajes los guarda por separado. Sin `WHATSAPP_APP_SECRET` responde 503 y Meta reintenta; sin `WHATSAPP_VERIFY_TOKEN` la verificación responde 403. La hora del mensaje es la de Meta, salvo que sea inválida o futura. El tipo de mensaje que Turnoo no maneja se guarda como `otro`, sin contenido.
- **Tareas internas:** temporizador solo en `index.ts`, nunca en `crearApp`. Una instancia se salta la tarea si otra la está corriendo (`pg_try_advisory_xact_lock`), y `SKIP LOCKED` respeta lo que un barbero esté cambiando. Corren también en negocios suspendidos, porque que pase el tiempo no es una modificación del negocio. Una cita vencida queda con `cancelada_por = 'sistema'`. El log tiene una línea por tarea con cambios (nombre, cantidad y duración) y los ciclos sin cambios van en `debug`; nunca teléfonos, nombres ni correos. Un fallo se registra y no tumba la API.
- **Límite de login:** el intento se cuenta antes de verificar la contraseña y un login correcto lo devuelve. El login correcto reinicia solo el contador de esa cuenta e IP, para que un atacante no limpie los demás entrando a su propia cuenta. Estando frenado no se suma en ningún contador, y un bloqueo vence solo: no hay ruta para quitarlo antes.
- **IP real:** `SALTOS_PROXY` vale 0 por defecto, así que `X-Forwarded-For` se ignora. Detrás de Caddy debe ser 1, y el puerto de la API no debe quedar expuesto a internet, porque quien llegue directo podría falsificar su IP. En IPv6 se cuenta la red /64.
- **Anonimizar un cliente:** no se puede deshacer. Se rechaza con el número de citas activas, aunque su hora ya haya pasado, hasta que se cancelen o se marquen. Quita nombre, teléfono y notas; borra sus conversaciones, mensajes y derivaciones, y las notas de sus citas. Conserva las citas y el registro de `consentimientos`, como prueba de la autorización. Si la persona vuelve a escribir, es un cliente nuevo.
- **Lista de clientes:** los anonimizados no aparecen, pero se consultan por id. Los clientes se crean al agendar; no hay ruta para crearlos sueltos, y el historial por cliente queda para la ficha de la fase 2.
- **Desactivar un barbero con citas futuras:** se rechaza con un error que indica cuántas tiene, hasta que se cancelen.
- **Bloqueo o cambio de horario que choca con citas:** se guarda y la respuesta lista las citas afectadas para que el negocio decida.
- **Negocio suspendido:** puede iniciar sesión y consultar, pero no modificar nada. Única excepción: el dueño puede anonimizar a un cliente, porque un problema de pago no debe frenar el derecho de la persona a que borren sus datos (Ley 1581).
- **Borrado:** barberos y servicios se desactivan, no se borran. Horarios y bloqueos sí se borran.
- **Dueños:** nadie puede desactivar al último dueño activo.
- **Límite del plan:** crear un barbero respeta `planes.max_profesionales`; `plan_id` nulo significa sin límite.
- **Reactivación:** la recuperación de contraseña no reactiva usuarios desactivados; solo la invitación activa. Para reactivar a alguien se reenvía su invitación, que define una contraseña nueva.
- **Desactivar un usuario:** cierra sus sesiones y anula sus enlaces pendientes. Conserva su barbero asociado. Un dueño puede desactivar a otro dueño, siempre que quede uno activo.
- **Barbero desactivado:** su agenda se consulta, pero no se modifica. Hay que reactivarlo primero.
- **Bloqueos:** el dueño debe enviar `profesionalId`, o `null` para todo el negocio, para que un olvido no cierre el negocio. El empleado solo actúa sobre su barbero y ve también los cierres del negocio. Un bloqueo o un horario se cambia borrándolo y creándolo de nuevo.
- **Reenviar invitación:** solo para usuarios pendientes o desactivados, y anula los enlaces anteriores. Igual que la recuperación, el dueño solo puede pedirla para empleados, porque el enlace define la contraseña.

### 6.2 Plan de la IA (acordado en la sesión 6)

**Decisiones:**

- **Proveedor:** OpenAI, porque Juan José ya tiene saldo cargado. Se usa el modelo mini más barato que siga vigente, con el nombre en una variable de entorno. Toda la llamada al proveedor queda en un solo archivo. La clave de API va solo en `backend/.env`.
- **Modelo, por confirmar:** el 5 de noviembre de 2026, la documentación de OpenAI muestra `gpt-5.4-mini` como el único mini vigente sin aviso de retiro (USD 0,75 / 4,50 por millón de tokens de entrada / salida). `gpt-5-mini` es más barato (USD 0,25 / 2,00), pero OpenAI lo retira el 11 de diciembre de 2026. `gpt-6-luna` no se llama mini, pero es más barato (USD 0,10 / 0,50) y es el reemplazo que OpenAI indica para varios minis.
- **Procesamiento:** una marca de pendiente en la conversación y un proceso dentro de la API que la toma con `SKIP LOCKED`, de a una por conversación y en orden. Sin pg-boss.
- **Mensajes seguidos:** se espera 5 segundos desde el último y se responde todo junto.
- **Token de Meta:** uno por cuenta, cifrado con AES-256-GCM. La clave vive en `backend/.env`, nunca en la base. Hace falta un token permanente de usuario del sistema.
- **Aviso de datos:** el primer mensaje recibe solo el aviso y no pasa por la IA. El aviso se envía apenas se guarda ese mensaje; si falla, se reintenta con el siguiente. Cuenta como aceptación un mensaje enviado después de que Meta confirmó el aviso, y desde entonces la IA puede leer también los mensajes anteriores. El aviso nombra a Meta y a OpenAI como terceros que reciben los datos. Texto: versión `2026-11-v1`, **pendiente de revisión legal, que debe quedar resuelta antes de atender clientes reales**.
- **Confirmación:** antes de crear la cita, la IA confirma día, hora, barbero y servicios, y espera el sí del cliente.
- **Fallos de la IA:** hasta 3 reintentos en pocos minutos. Si sigue fallando, deriva con motivo `error` y avisa al cliente que una persona lo contactará.
- **Audios e imágenes:** primero solo texto. Deben quedar hechos antes de atender clientes reales.
- **Clientes sin teléfono:** desde abril de 2026, Meta envía en cada mensaje el BSUID de la persona (`from_user_id`) y omite el teléfono si activó su nombre de usuario. Se guarda siempre el BSUID, y el BSUID manda sobre el teléfono para reconocer al cliente.

**Reglas para que un modelo barato agende bien:**

- La IA no calcula fechas: el backend le entrega la fecha de hoy y el día de la semana en la zona del negocio, y las funciones reciben fechas ya resueltas.
- Siempre consulta la disponibilidad con la función antes de ofrecer horarios, y nunca inventa horarios ni precios.
- El teléfono del cliente nunca se envía al modelo, y lo que escribe el cliente se trata como texto no confiable.
- Un reintento nunca puede crear una cita doble.
- Las pruebas automáticas usan un modelo simulado. Además hay un conjunto de 15 a 20 conversaciones de prueba en español con casos difíciles: cambia de hora, pide algo imposible, escribe mal, pregunta fuera de tema, o usa fechas como "mañana" o "el otro viernes". Si el modelo no las pasa todas, se sube de modelo cambiando solo la variable de entorno.
- **Antes de correr pruebas reales con costo (OpenAI o WhatsApp), se pide el visto bueno de Juan José.**

**Puntos, un pull request por cada uno:**

1. Enviar mensajes por WhatsApp y guardar el token cifrado. **Hecho** (falta la prueba con WhatsApp real).
2. En dos pull requests:
   - 2a. Clientes por BSUID, para los mensajes que llegan sin teléfono. **Hecho.**
   - 2b. Aviso de datos y consentimiento. **Hecho** (falta la prueba con WhatsApp real).
3. Procesamiento de mensajes pendientes, con la espera de 5 segundos. **Hecho** (se inicia con la IA).
4. Rutas para que el dueño administre la base de conocimiento. **Hecho.**
5. IA con sus 7 funciones, solo texto, y el conjunto de conversaciones de prueba.
6. Derivación, conteo de tokens y límites del plan.
7. Audios e imágenes.

**Antes de atender clientes reales** también hace falta el aviso al dueño cuando la IA deriva, que usa una plantilla y entra con las tareas de WhatsApp. Antes del despliegue se propondrá una tarea aparte para llevar el control de las migraciones aplicadas.

## 7. Pendientes por decidir

- Planes: nombres, precios y límites concretos (la tabla `planes` está vacía a propósito).
- Cómo se factura WhatsApp a Meta para que lo pague Turnoo (por defecto Meta le cobra al dueño de cada cuenta) y cómo se da de alta cada negocio (manual al inicio; el registro integrado de Meta exige verificación de la empresa).
- Servicio de transcripción de audio. El proveedor de IA ya está decidido (OpenAI, sección 6.2); falta confirmar el modelo.
- Servicio de envío de correos (invitaciones y recuperación de contraseña).
- Política de retención de mensajes y audios.
- Revisión legal del texto de autorización de datos y de la política de tratamiento (Ley 1581 de 2012).
- Aspectos tributarios y de facturación al cobrar la mensualidad.
- Validar el horario permitido para recordatorios (07:00 a 21:00).
- Licencia del repositorio y si el repositorio será público.

## 8. Notas técnicas y trampas conocidas

- **Tipos de `pg`:** `time` llega como texto `'HH:MM:SS'`, `timestamptz` como `Date`, `integer` como número y **`bigint` como texto** (cuidado con los contadores de tokens de `uso_mensual`).
- **Errores de PostgreSQL:** `23P01` de la restricción `citas_sin_solapes` → `HorarioNoDisponible`; otro `23P01` → `DatosInvalidos`; `23505` → `Duplicado`; `23514` con el mensaje de transición de cita → `TransicionNoPermitida`. Si se renombra la restricción de citas, hay que actualizar `traducirErrorPostgres`.
- **RLS:** el superusuario `turnoo_admin` se salta el RLS; la aplicación y las pruebas usan `turnoo_app`. Las tareas que cruzan negocios usan `conSistema`.
- **Pruebas:** corren de a un archivo a la vez (comparten `turnoo_test`), cada archivo crea y borra sus propios negocios, y un seguro aborta si la base no termina en `_test`. Tras cada migración nueva hay que correr `npm run db:pruebas`.
- **Webhook de WhatsApp:** su router debe registrarse **antes** de `express.json()` con su propio `express.raw()` (ver comentario en `app.ts`).
- **Express 5:** los errores de funciones `async` llegan solos al manejador central.
- **Fechas:** solo `compartido/tiempo.ts` hace cuentas de fechas. Instantes en UTC; la hora local del negocio se calcula con `negocios.zona_horaria`.
- **Migraciones:** una vez aplicada, una migración nunca se edita; un cambio es una migración nueva (numerada, en una transacción, probada desde la 001 sobre una base vacía). Si cambia el modelo, se actualiza ARQUITECTURA.md.
- **Meta:** las respuestas dentro de la ventana de 24 h no tienen costo; los recordatorios y avisos al dueño son plantillas de utilidad con costo. Los mensajes de promoción son mucho más caros (fase 3).
- **Seguridad:** secretos solo en `.env`; token de Meta cifrado en la base con la clave fuera de ella; no registrar contenido de mensajes ni teléfonos completos en los logs.

## 8.1 Qué funciona ya

- **Autenticación:** login, sesiones revocables, invitaciones y recuperación por `/auth/*`, y el script del primer superadmin.
- **Negocios:** alta, plan y estado por `/negocios` (superadmin); datos y configuración por `/negocio` (dueño).
- **Barberos y usuarios:** `/profesionales` y `/auth/usuarios`, incluida la invitación de un empleado con su barbero.
- **Agenda:** servicios y horarios de cada barbero, y bloqueos del barbero o de todo el negocio.
- **Citas por HTTP:** listar, consultar, crear, cancelar, reprogramar, aprobar, rechazar y marcar por `/citas`, con permisos por rol.
- **Disponibilidad:** `consultarDisponibilidad(negocioId, { profesionalId, servicioIds, desde, hasta })` devuelve, por día, las horas en que puede empezar una cita para esa combinación de servicios, descontando horario del barbero, bloqueos y citas activas, con intervalo alineado al reloj y respetando anticipación mínima y máxima.

Un negocio ya se puede dar de alta y dejar listo para agendar sin tocar la base.

## 9. Mapa de archivos

```
Turnoo/
├── README.md, docker-compose.yml, .env.example, .gitignore
├── db/migrations/            001_init.sql, 002_inasistencias_y_aprobacion.sql, 003_sesiones.sql, 004_anonimizar_clientes.sql, 005_intentos_login.sql, 006_cancelada_por_sistema.sql, 007_media_id_mensajes.sql
├── docs/                     CONTEXTO.md (este), ARQUITECTURA.md, CONVENCIONES.md
└── backend/
    ├── package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, .env.example, README.md
    ├── scripts/              preparar-base-pruebas.ts, crear-superadmin.ts
    ├── pruebas/              ayudas.ts, configuracion.ts y los *.test.ts
    └── src/
        ├── index.ts, app.ts
        ├── config/entorno.ts
        ├── db/               pool.ts, contexto.ts, previas.ts
        ├── compartido/       errores.ts, logger.ts, tiempo.ts, validacion.ts
        ├── tareas/           tareas.ts, programador.ts
        └── modulos/
            ├── auth/         auth.rutas.ts, auth.middleware.ts, auth.servicio.ts, auth.intentos.ts, auth.repositorio.ts, auth.tipos.ts
            ├── citas/        citas.rutas.ts, disponibilidad.ts, citas.servicio.ts, citas.repositorio.ts, citas.tipos.ts
            ├── clientes/     clientes.rutas.ts, clientes.servicio.ts, clientes.repositorio.ts, clientes.tipos.ts
            ├── negocios/     negocios.rutas.ts, negocios.servicio.ts, negocios.reglas.ts, negocios.repositorio.ts, negocios.tipos.ts
            ├── whatsapp/     whatsapp.rutas.ts, whatsapp.firma.ts, whatsapp.servicio.ts, whatsapp.repositorio.ts, whatsapp.tipos.ts
            └── profesionales/ profesionales.rutas.ts, profesionales.servicio.ts, profesionales.reglas.ts, profesionales.repositorio.ts, profesionales.tipos.ts,
                              agenda.rutas.ts, agenda.servicio.ts, agenda.repositorio.ts, agenda.tipos.ts
```

## 10. Cómo mantener este archivo y registro de sesiones

Al terminar cada sesión de trabajo: actualizar la sección 4 (estado), la 5 (siguiente paso), la 7 (pendientes) y agregar una línea al registro. Si una decisión cambia, corregirla aquí y en ARQUITECTURA.md en el mismo commit.

| Sesión | Qué se hizo |
|---|---|
| 1 | Se eligió la idea y se definió todo el producto con preguntas por rondas. Se diseñó y se aplicó la base de datos (migraciones 001 y 002), se escribió la guía (README, ARQUITECTURA, CONVENCIONES), se montó el esqueleto del backend con aislamiento por negocio, se agregaron 85 pruebas automáticas y se construyó el cálculo de disponibilidad de citas. |
| 2 | Se implementó el segundo tramo del módulo de citas (crear, cancelar, reprogramar, aprobar/rechazar, marcar) con 28 pruebas nuevas; se verificó rompiendo cada regla a propósito. Decisiones: una `por_aprobar` sin tiempo para el plazo se rechaza con mensaje de contactar al negocio; `por_aprobar` no se reprograma; marcar solo desde la hora de inicio; el límite del plan se cuenta de forma atómica al final de la transacción. Siguiente: autenticación o webhook de WhatsApp (sección 6). |
| 3 | Autenticación y usuarios. Decisiones: sesión en la base (revocable), argon2, invitaciones y recuperación SIN correo (el backend entrega el enlace al dueño/superadmin, que se lo pasa a la persona; nunca a quien lo pide, para que nadie pueda robar cuentas). El enlace lleva el token en el fragmento `#token=` para que no quede en registros. Verificado rompiendo 10 reglas de seguridad a propósito. Pendientes: límite de intentos de login, correo, rutas de citas, webhook. |
| 4 | Rutas HTTP de citas para el panel y módulo de clientes. Decisiones: el panel agenda enviando teléfono y nombre (se busca o se crea el cliente); un empleado solo ve y maneja las citas de su barbero y una cita ajena responde 404; el superadmin no entra a citas de un negocio; los rangos de fechas se piden en ISO con zona y el máximo es 62 días. Verificado rompiendo 8 reglas de permisos y de clientes a propósito. Pendientes: webhook, rutas de administración (barberos, servicios, horarios, clientes, usuarios), límite de intentos de login. |
| 5 | Se revisó el estado real contra el código (`npm run typecheck` sin errores y 151 pruebas en verde), se corrigió la documentación desactualizada y se acordó el plan de la sección 6.1. El regreso del modo humano queda como evaluación al llegar el siguiente mensaje, no como tarea. Punto 1: módulo de negocios y suspensión completa (ya no se crea un cliente ni se administran usuarios estando suspendido), con 31 pruebas nuevas; se verificó rompiendo reglas a propósito. Corrección: la versión anterior de este archivo decía que un negocio suspendido podía aprobar, rechazar y marcar, y era falso; esas acciones ya lo impedían. Punto 2: barberos y usuarios, con 46 pruebas nuevas; la recuperación ya no reactiva usuarios y se verificó rompiendo reglas a propósito, incluidas las carreras con bloqueos. Punto 3: servicios, horarios y bloqueos, con 57 pruebas nuevas; se verificó rompiendo reglas a propósito y de punta a punta, sin SQL, hasta agendar una cita. Punto 4: clientes, con la migración 004 y 58 pruebas nuevas; se verificó rompiendo reglas a propósito, incluidas las carreras entre agendar y anonimizar. Se agregó una excepción a la suspensión: el dueño puede anonimizar, por la Ley 1581. Punto 5: límite de intentos de login y `SALTOS_PROXY`, con la migración 005 y 33 pruebas nuevas; se verificó rompiendo reglas a propósito, incluidas las peticiones simultáneas. Punto 6: tareas internas con temporizador simple, la migración 006 y 35 pruebas nuevas; se verificó rompiendo reglas a propósito y arrancando el servidor real contra `turnoo_test`. Punto 7: webhook de WhatsApp con la migración 007 y 56 pruebas nuevas; se verificó rompiendo reglas a propósito y con peticiones firmadas al servidor real contra `turnoo_test`, sin WhatsApp real porque la cuenta de Meta aún no está lista. Después se probó con WhatsApp real: faltaba suscribir la app a la cuenta de WhatsApp Business, y con ese paso llegaron y se guardaron dos mensajes de texto. Siguiente: acordar el plan de la IA. |
| 6 | Se acordó el plan de la IA (sección 6.2): OpenAI con el modelo en una variable de entorno, procesamiento propio con `SKIP LOCKED` sin pg-boss, aviso de datos antes de la IA y consentimiento al seguir conversando, y reglas para que un modelo barato agende bien. Se corrigió `ARQUITECTURA.md`: decía que el consentimiento se registraba al enviar el aviso. Punto 1: envío de mensajes de texto y registro de cuentas de WhatsApp con el token cifrado (AES-256-GCM), con 52 pruebas nuevas; se verificó rompiendo reglas a propósito (34 de 37 detectadas; una era un hueco real y se agregó su prueba, las otras dos no cambian el comportamiento). Sin prueba con WhatsApp real todavía. Punto 2a: la revisión de los mensajes sin `from` confirmó el riesgo en la documentación de Meta (BSUID y nombres de usuario); migración 008 y clientes por BSUID, con 16 pruebas nuevas y 16 de 16 reglas rotas a propósito detectadas. Punto 2b: aviso de datos y consentimiento con la migración 009 y 16 pruebas nuevas; 18 de 18 reglas rotas a propósito detectadas (tres mutaciones se rehicieron porque rompían el SQL en vez de la regla). Las pruebas del 2b encontraron un error del 2a: sin BSUID no había candado y dos mensajes simultáneos de un cliente nuevo respondían 500; se corrigió con un candado también por teléfono. Prueba real del aviso y del consentimiento: todo cuadró. Punto 3: procesador de conversaciones pendientes con la migración 010 y 26 pruebas nuevas; se rompieron 27 reglas a propósito: 22 detectadas a la primera, 3 huecos reales con su prueba agregada y 2 mutaciones que no cambian el comportamiento. |
