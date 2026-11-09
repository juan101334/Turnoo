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

**Tecnología:** Node.js 22 + TypeScript (módulos ES, imports con extensión `.js`) + Express 5 + SQL directo con `pg` (sin ORM). PostgreSQL 17 en Docker (puerto **5433** en el equipo de desarrollo). Panel en Next.js 16 (App Router, Tailwind CSS 4), en `panel/`: el navegador solo habla con el panel y el panel llama al backend desde su servidor. Las tareas internas corren con un temporizador simple dentro de la API; Los mensajes para la IA se procesarán con una marca de pendiente en la conversación y `SKIP LOCKED`, sin pg-boss (decidido en la sesión 6). Despliegue en un VPS con Docker Compose y Caddy para HTTPS. Un solo repositorio con `backend/` y `panel/`.

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

**Recordatorio:** uno solo, ~11 h antes, con plantilla de WhatsApp (casi siempre cae fuera de la ventana de 24 h, así que tiene costo). No se envía de noche (07:00 a 21:00, valor propuesto que falta validar): si el momento ideal cae de noche, sale en el borde más cercano (cita a las 10:00: a las 21:00 de la noche anterior; cita a las 16:00: a las 07:00 del mismo día). No se envía si la cita se agendó o reprogramó después del momento ideal, si el cliente no ha aceptado el aviso de datos o si no comparte su teléfono. Si el cliente responde, se abre la ventana de 24 h y lo atiende la IA.

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
| **761 pruebas automáticas en verde** (85 + 28 de gestión de citas + 18 de autenticación + 8 de clientes + 12 de rutas de citas + 31 de negocios + 46 de barberos y usuarios + 57 de servicios, horarios y bloqueos + 59 de rutas de clientes + 33 del límite de login + 35 de tareas internas + 56 del webhook + 52 del envío por WhatsApp + 16 de clientes por BSUID + 16 del aviso de datos + 26 del procesador de conversaciones + 21 de la base de conocimiento + 38 de la IA con un modelo simulado + 11 del uso del plan + 18 de notas de voz e imágenes + 23 de avisos al dueño y conversaciones del panel + 23 del control de migraciones + 32 del recordatorio + 4 de recuperar al superadmin + 1 de la respuesta descartada + 6 de lo que necesita el panel + 6 del reintento por conexión caída) contra una base `turnoo_test` aparte | `backend/pruebas/` |
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
| Migración 011: tabla `ia_pasos` con las funciones que pidió la IA y sus resultados, con RLS. Se le devuelven en los turnos siguientes para que recuerde lo que consultó | `db/migrations/011_ia_pasos.sql` |
| Migración 012: `mensajes.adjunto_error` (por qué no se procesó un adjunto) y `mensajes.cita_id` (cita a la que quedó adjunta una imagen) | `db/migrations/012_adjuntos.sql` |
| Control de migraciones: `npm run db:migrar` (también lo usa `db:pruebas`) y la tabla `migraciones_aplicadas`, que crea el propio comando y que `turnoo_app` no puede leer ni cambiar | `backend/scripts/migraciones.ts`, `backend/scripts/migrar.ts` |
| Migración 014: recordatorio de la cita en `citas` (`recordatorio_resultado`, intentos y reserva) y `citas.programada_en` (cuándo se fijó la hora actual) | `db/migrations/014_recordatorio_cita.sql` |
| Recordatorio de la cita: una tarea envía la plantilla `turnoo_recordatorio_cita` al cliente `horas_recordatorio` antes, llevada al borde más cercano del horario permitido. No se envía si se agendó después de ese momento, sin consentimiento de datos, sin teléfono ni a menos de 30 min de la cita; cada caso queda anotado en `recordatorio_resultado` | `backend/src/modulos/recordatorios/` |
| Migración 013: estado del aviso al dueño en `derivaciones` (`aviso_resultado`, intentos y reserva) y `uso_mensual.aviso_limite_en` | `db/migrations/013_avisos_al_dueno.sql` |
| Procesador de conversaciones: el webhook marca pendiente la conversación de quien ya aceptó el aviso; el procesador la reserva con `SKIP LOCKED`, responde 5 s después del último mensaje (o 30 s después del primero), reintenta a los 30 s, 1 y 2 min, y luego deriva con motivo `error` y avisa al cliente. Descarta lo que está en modo humano o lleva 24 h. **Aún no se inicia en `index.ts`: lo conecta la IA (punto 5)** | `backend/src/procesador/` |
| Base de conocimiento: el dueño lista, crea, edita, activa o desactiva y borra preguntas con su respuesta por `/conocimiento`. Topes: pregunta de 300 caracteres, respuesta de 2.000, 200 entradas y 20.000 caracteres entre las activas, porque todas van en cada llamada a la IA. No admite dos preguntas iguales (sin distinguir mayúsculas) | `backend/src/modulos/conocimiento/` |
| IA (OpenAI, Responses API): `ia.proveedor.ts` es el único archivo que llama al proveedor (`store: false`, funciones con `strict: true`, una función por vez). Variables `OPENAI_API_KEY`, `OPENAI_MODELO` (por defecto `gpt-6-luna`) y `OPENAI_ESFUERZO` (por defecto `low`). Las instrucciones dan hoy y un calendario con el día de la semana de cada fecha; las 7 funciones llaman a los servicios de citas con el negocio y el cliente que pone el backend. Hasta 6 llamadas al modelo por respuesta. El procesador arranca con la API solo si hay clave | `backend/src/modulos/ia/` |
| Conversaciones e historial: los últimos 30 mensajes (sin los del sistema ni los que no llegaron) y `derivarConversacion`, que comparten la IA y el procesador | `backend/src/modulos/conversaciones/` |
| Uso del plan: cada conversación de IA cuenta una vez al mes (`ia_contada_periodo`) y los tokens de cada atención se suman en `uso_mensual`, en el mes local del negocio. Con el plan lleno, una conversación nueva no pasa por la IA: se deriva con motivo `limite_plan` y se avisa al cliente; las ya contadas siguen. Sin plan no hay límite | `backend/src/modulos/uso/` |
| Notas de voz e imágenes: se procesan justo antes de que la IA atienda (como máximo 5 por atención, de las últimas 24 h). Descarga de Meta con el token de la cuenta, transcripción en `ia.proveedor.ts`, imágenes en disco con permisos 600. El panel las ve en `GET /citas/:id/imagenes` y `GET /citas/:id/imagenes/:imagenId`, con los permisos de la cita | `backend/src/modulos/adjuntos/` |
| Avisos al dueño por plantilla (`turnoo_derivacion`, `turnoo_limite_plan`): tareas `avisar_derivaciones` y `avisar_limites_del_plan`, con reserva `SKIP LOCKED`, 3 intentos y 24 h de vigencia. Rutas `/conversaciones` para que el dueño lea y responda | `backend/src/modulos/avisos/`, `backend/src/modulos/conversaciones/conversaciones.rutas.ts` |
| 20 conversaciones de prueba contra el modelo real, calificadas con reglas sobre la base y los textos. Cuestan saldo: `npm run ia:evaluar`. El informe queda en `backend/evaluacion/resultados/` (no se sube) | `backend/evaluacion/` |
| Migración 006: `citas.cancelada_por` admite `sistema` | `db/migrations/006_cancelada_por_sistema.sql` |
| Tareas internas, al arrancar y cada minuto: expirar `por_aprobar` vencidas (liberan el hueco), autocompletar citas pasadas `horas_autocompletar_cita` desde su fin (hasta 500 por ciclo cada una) y limpiar `intentos_login` vencidos | `backend/src/tareas/` |
| Migración 005: tabla `intentos_login`, visible solo en el contexto de sistema | `db/migrations/005_intentos_login.sql` |
| Límite de intentos de login: 5 por cuenta e IP, 20 por cuenta y 30 por IP, en ventanas de 15 minutos; responde 429 con `Retry-After`. `SALTOS_PROXY` define de dónde sale la IP real | `backend/src/modulos/auth/auth.intentos.ts` |
| Migración 004: `clientes.telefono` admite NULL solo si el cliente está anonimizado | `db/migrations/004_anonimizar_clientes.sql` |
| Rutas `/clientes` para el panel: `GET /` (búsqueda por nombre o teléfono, paginada con `limite`, `desplazamiento` y `hayMas`), `GET /:id`, `PATCH /:id` y `POST /:id/anonimizar`. El dueño ve todo el negocio; el empleado, los clientes con citas de su barbero | `backend/src/modulos/clientes/clientes.rutas.ts` |
| Autenticación: login con argon2, sesiones en la base (7 días, revocables), invitaciones (72 h) y recuperación (1 h) con enlace de un solo uso, roles; rutas `/auth/*` | `backend/src/modulos/auth/` |
| Script del primer superadmin: `npm run superadmin -- correo "Nombre"` (imprime el enlace para fijar la contraseña) | `backend/scripts/crear-superadmin.ts` |
| Recuperar al superadmin: `npm run recuperar-superadmin -- correo` anula sus enlaces anteriores e imprime uno nuevo: de recuperación (1 h) si está activo o de invitación (72 h) si nunca definió su contraseña. A uno desactivado no le da enlace. Solo con acceso al servidor: no hay ruta HTTP | `backend/scripts/recuperar-superadmin.ts` |
| Archivos de despliegue: imagen del backend (`api` y `herramientas`), `docker-compose.prod.yml` (base sin puertos, migraciones antes de la API, Caddy con HTTPS) y copias de seguridad de la base y de las imágenes. Guía en `docs/DESPLIEGUE.md` | `backend/Dockerfile`, `docker-compose.prod.yml`, `despliegue/` |

**No existe todavía:**

- Del panel: agenda, acciones sobre citas, bloqueos, clientes y la vista del dueño (hecho: acceso, sesión y navegación). Envío de correo.
- El despliegue en un servidor real (los archivos ya están; falta el servidor).
- Del webhook falta: descarga de audios e imágenes y estados de entrega (los `statuses` de Meta).
- Del envío falta: plantillas (fuera de la ventana de 24 h) y la prueba con WhatsApp real.
- Tareas con WhatsApp: recordatorios, avisos de derivación y avisos al cliente.
- Creación de planes: la tabla `planes` sigue vacía a propósito (sección 7), así que hoy solo se puede asignar un plan creado con SQL.
- CORS en `app.ts`: no hace falta. El navegador nunca llama al backend; lo llama el servidor del panel.

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
npm run db:migrar     # aplica a la base de desarrollo las migraciones pendientes (-- --estado solo las lista)
npm test              # 749 pruebas
npm run ia:evaluar    # 24 conversaciones con el modelo real de OpenAI (cuesta saldo: pedir visto bueno)
```

Aplicar una migración nueva a la base de desarrollo: `npm run db:migrar` desde `backend/`. Aplica las pendientes en orden, cada una con su anotación en `migraciones_aplicadas` en la misma transacción, y se detiene si una ya aplicada cambió (huella sha256), si falta un archivo aplicado o si una nueva tiene número menor que la última aplicada. Cada archivo debe tener una línea `BEGIN;` y terminar con una línea `COMMIT;`. Una base migrada a mano antes de este control se anota una sola vez con `npm run db:migrar -- --registrar-hasta NNN`.

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

6. **Crear las tres plantillas en la WABA del negocio** (WhatsApp Manager > Plantillas de mensajes > Crear plantilla). Las plantillas son de cada cuenta: hay que crearlas al dar de alta cada negocio. Categoría **Utilidad**, idioma **Español (COL)** (`es_CO`; con otro idioma, aunque sea `es`, Meta lo trata como otra plantilla y responde 132001), variables **con nombre**. El código depende solo del nombre de la plantilla, del idioma y de los nombres de las variables (`backend/src/modulos/avisos/avisos.servicio.ts` y `backend/src/modulos/recordatorios/recordatorios.servicio.ts`); el texto de alrededor puede cambiar y, con variables con nombre, el orden no importa. Meta pide un ejemplo por variable y tarda hasta 24 h en aprobarlas. Sin la plantilla aprobada, el aviso falla con el error 132001 y queda `fallido`. Si la revisión automática de Meta la marca como Marketing, se reescribe en tono de notificación (sin saludo): como Marketing, el dueño podría dejar de recibirla (error 131050). Un dato por línea, con la etiqueta en negrita (`*Cliente:*`), para que se lea de un vistazo; ningún cuerpo empieza ni termina con una variable, porque Meta lo rechaza. Los avisos al dueño llevan encabezado y pie fijos, sin variables, así que el código no los envía. Textos de los avisos al dueño (editados y enviados a revisión el 7 de noviembre de 2026; los anteriores eran un párrafo seguido):
   - `turnoo_derivacion`. Encabezado `Un cliente necesita atención`; pie `Aviso automático de Turnoo`. Ejemplos: `Laura`, `Pidió hablar con una persona`, `precio de las ceras`, `+573001234567`, `2`. Dice "necesita" y no "pidió" porque con los motivos `limite_plan` y `error` el cliente no pidió nada.
     ```
     Un cliente necesita que alguien del negocio le responda.

     *Cliente:* {{cliente}}
     *Motivo:* {{motivo}}
     *Lo que pidió:* {{detalle}}
     *Contacto:* {{contacto}}

     El asistente no le responderá durante las próximas {{horas}} horas.
     ```
   - `turnoo_limite_plan`. Encabezado `Uso de tu plan`; pie `Aviso automático de Turnoo`. Ejemplos: `Barbería La 70`, `80`, `100`.
     ```
     Tu negocio *{{negocio}}* ya usó {{usadas}} de las {{limite}} conversaciones con el asistente que incluye tu plan este mes.

     Al llegar al límite, el asistente no atenderá conversaciones nuevas: te avisaremos de cada una para que la respondas tú. Las que ya empezaron siguen con el asistente.

     El conteo vuelve a cero el primer día de cada mes.
     ```
   - `turnoo_recordatorio_cita` (va al cliente), enviada a revisión con este texto: `Recordatorio de cita: hola, {{cliente}}. Tienes una cita en {{negocio}} el {{fecha}} a las {{hora}} con {{profesional}} para {{servicios}}. Si necesitas cancelar o cambiar la hora, responde a este mensaje.` Ejemplos: `Laura`, `Barbería La 70`, `sábado 17 de marzo`, `10:00 a. m.`, `Carlos`, `Corte y Barba`. Cuando la aprueben se edita al formato de una línea por dato (encabezado `Recordatorio de tu cita`; `*Fecha:*`, `*Hora:*`, `*Servicio:*`, `*Te atiende:*`), sin pie: el cliente ve el WhatsApp de la barbería, no la marca Turnoo.
7. **Configurar el teléfono de avisos del dueño** con `PATCH /negocio` (`telefonoAvisos`). Sin él, los avisos esperan hasta 24 h y después se dan por vencidos.

**Prueba real del aviso de datos (5 de noviembre de 2026).** El primer mensaje recibió el aviso, que llegó al celular, y quedó un saliente `sistema | enviado` sin reserva colgada y sin consentimiento. El segundo mensaje registró el consentimiento `2026-11-v1` con su hora según Meta, sin enviar otro aviso. Meta ya envía el BSUID: el cliente, que tenía solo teléfono, lo recibió sin duplicarse. El envío a Meta tardó unos 6 s, con un tiempo máximo de 10 s: si se repite, conviene subirlo. **Prueba de agendar por WhatsApp (8 de noviembre de 2026):** la IA consultó la disponibilidad y creó la cita (`crear_cita`), que apareció en el panel. Un envío falló al instante con "Sin respuesta de Meta" (no fue un tiempo agotado: la conexión que Node reutiliza ya estaba cerrada) y el procesador volvió a llamar a la IA; el cliente no recibió nada repetido. Desde entonces, si la conexión falla antes de que Meta responda (`ECONNRESET`, `UND_ERR_SOCKET`, `ECONNREFUSED`, `EPIPE`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`), el envío se reintenta una vez enseguida, sin volver a llamar a la IA; un tiempo agotado no se reintenta ahí (Meta pudo recibirlo). El error guardado lleva la causa: `Sin respuesta de Meta (ECONNRESET)`. Falta probar con WhatsApp real el envío por `recipient`.

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
- **Audios e imágenes:** las notas de voz se transcriben con `gpt-transcribe` (US$0,0045 por minuto; acepta el ogg/opus de WhatsApp tal cual, probado con una nota real) y solo se guarda el texto; las de más de 2 minutos no se transcriben. Las imágenes (jpg, png o webp de hasta 5 MB, reconocidas por sus bytes) se guardan en `ARCHIVOS_DIR` y se adjuntan a la cita que agende el cliente; la IA no las ve y no van a OpenAI. Al anonimizar a un cliente se borran sus imágenes del disco. **Para la revisión legal:** las notas de voz sí van a OpenAI.
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
5. IA con sus 7 funciones, solo texto, y el conjunto de conversaciones de prueba. **Hecho.** gpt-6-luna con esfuerzo `low` pasó las 20 conversaciones de prueba dos veces seguidas (2026-11-06), a unos US$0,006 por corrida completa. Las primeras corridas fallaron porque la IA no recordaba en el turno siguiente qué había consultado; se arregló guardando sus funciones (migración 011), no subiendo de modelo.
6. Derivación, conteo de tokens y límites del plan. **Hecho** sin el aviso al dueño (al derivar y al 80% del límite), que usa plantillas y entra con las tareas de WhatsApp. El regreso a la IA a las 2 h ya existía: se evalúa en el webhook al llegar el siguiente mensaje. **Probado con WhatsApp real (2026-11-05):** la IA agendó una cita de punta a punta. Esa prueba encontró dos fallas que las conversaciones de prueba no veían, porque salían del historial real: tomaba como vigentes resultados viejos (ahora solo se le devuelven las funciones de los últimos 30 minutos) y se quedaba callada después de una derivación (lo causaba la descripción de `derivar_a_humano`). Las dos quedaron en el conjunto de prueba, que ahora tiene 22 conversaciones y pasa completo.
7. Audios e imágenes. **Hecho y probado con WhatsApp real (2026-11-06):** una nota de voz transcrita llevó a la IA a proponer la cita, la foto quedó guardada y, con el "sí", la cita quedó creada con la imagen adjunta. Las 24 conversaciones de prueba pasaron dos veces seguidas (unos US$0,009 por corrida), después de aclarar que con "cualquier barbero" hay que consultar a todos.

**Aviso al dueño: hecho.** Al derivar y al llegar al 80% del límite del plan, una tarea interna envía una plantilla al teléfono de avisos del negocio (a cualquier hora; pasos 6 y 7 de "Conectar una cuenta de WhatsApp"). Para responder a un cliente, sobre todo uno que no comparte su teléfono, el dueño tiene `GET /conversaciones`, `GET /conversaciones/:id/mensajes` y `POST /conversaciones/:id/mensajes`; responder toma la conversación y reinicia las horas del modo humano. Si el dueño la toma mientras la IA está respondiendo, la respuesta de la IA se descarta: se comprueba con la conversación bloqueada, justo antes de guardar y enviar. **Probado con WhatsApp real (2026-11-07):** la plantilla `turnoo_derivacion` llegó al teléfono de avisos con nombre, motivo, detalle y número del cliente; la derivación quedó `enviado` y `uso_mensual.plantillas_enviadas` sumó 1. El primer intento falló con 132001 porque el código enviaba `es` y la plantilla estaba en `es_CO`. Esos dos defectos de redacción (dos puntos seguidos si el detalle terminaba en punto, y "solicitó" con los motivos `error` o `limite_plan`) se corrigieron con el texto nuevo, de un dato por línea (paso 6); falta la aprobación de Meta y volver a recibir ambos avisos. `turnoo_limite_plan` también llegó con WhatsApp real (2026-11-07), con un plan temporal de 1 conversación que después se quitó. El control de las migraciones aplicadas ya está: `npm run db:migrar`.

**Pulido del frontend antes de desplegar (aprobado el 8 de noviembre de 2026).** Auditoría de las 36 pantallas a 375 y 1920 px y plan de 8 PRs: 1 backend para el dueño → 2 fundaciones (tipografía IBM Plex Sans y Plex Sans Condensed para horas, azul de Turnoo más profundo con franja de color por estado, marco ancho, menú agrupado, carga, avisos, formularios que no se vacían, refresco) → 3 agenda (celular: "Sigue", tarjeta con fin, duración y precio, "Completada" en la tarjeta, huecos para agendar; escritorio: vista por horas con columnas por barbero y detalle en panel lateral; solo vista de día) → 4 flujo de citas (Nueva cita con el cliente primero, búsqueda por nombre o teléfono y horas por franjas) → 5 mensajes y clientes → 6 administración y cuenta → 7 superadmin básico con las rutas que ya existen (sin planes, uso ni pagos: el cobro no está diseñado) → 8 cierre (modo oscuro según el sistema, instalable solo con manifest e íconos, sin service worker ni caché sin conexión para no mostrar una agenda vieja, accesibilidad y rendimiento). PR 3 (agenda): en el celular y la tablet, Hoy muestra arriba "Sigue" (la cita en curso o la próxima, con cuenta regresiva, Llamar y Ver cita); cada tarjeta lleva la franja de color del estado, la hora grande, hasta qué hora, la duración y el precio, y "Completada" en la misma tarjeta cuando la cita ya empezó. Ese botón es optimista con "Deshacer": como el backend no permite volver una cita a pendiente, el panel la manda al backend cuando se acaba el aviso (7 s) o en cuanto la persona sale u oculta la pantalla; si el backend la rechaza, la tarjeta vuelve a como estaba. La lista intercala bloqueos y, con un solo barbero, los huecos libres (horario menos citas y bloqueos, desde ahora en el día de hoy, de 15 min o más) que llevan a Nueva cita con el día y el barbero. Un botón "Fecha" junto a la tira de días cambia de día al elegir. Desde 1024 px: grilla por horas con una columna por barbero (15 min = 20 px), fuera de horario en gris, bloqueos rayados, huecos que se pueden tocar, línea de "ahora" (la grilla abre desplazada hasta ella), nombres de los barberos fijos arriba, flechas de día anterior y siguiente, y el detalle de la cita en un panel lateral (`?cita=id`, se cierra con Escape; una cita ajena o inexistente no rompe la agenda). La pestaña del navegador dice qué cita está abierta. Los cálculos de la agenda están en `panel/lib/agenda.ts`, con pruebas unitarias. PR 2 (fundaciones): IBM Plex Sans y Plex Sans Condensed con `next/font` (las sirve el panel; utilidad `cifras` para horas y precios), colores más profundos con neutros de tono azul y colores propios por estado de cita, esquinas de 12 px en paneles. Marco hasta 1440 px; menú en tres tamaños: barra inferior en el celular (menos de 768 px), íconos con nombre corto en tablet (768 a 1023) y lateral agrupado desde 1024 ("Día a día", "Clientes y equipo", "Negocio" y "Cuenta" al pie); "Más" con los mismos grupos. La acción principal ("Nueva cita", "Bloquear horas", "Invitar") flota abajo a la derecha en el celular. Esqueletos de carga por pantalla (`loading.tsx`; en producción aparecen en menos de 100 ms). Avisos breves para los resultados (los errores siguen junto al formulario); `?listo=` se convierte en aviso y se quita de la URL. Los formularios ya no se vacían si el backend rechaza algo (envío desde onSubmit; los de agregar se limpian al guardar). Hoy, Agenda, Por aprobar y Mensajes se actualizan solos cada minuto (la conversación abierta, cada 20 s) y al volver a la pestaña. Franja de cuenta suspendida para el dueño. Títulos de pestaña con la hora y el cliente, el nombre del barbero o del cliente. Con las pantallas de carga, una página que no existe muestra "Esta página no existe" pero responde 200 (Next ya mandó la respuesta por partes). Proyecto "escritorio" (1440 px) en Playwright con los flujos principales. Logo (elegido el 8 de noviembre de 2026 entre 3 variantes, «Giro»): «Turn» con los glifos de IBM Plex Sans SemiBold y dos «o» enlazadas, la segunda abierta como un turno que gira, en `#075985` con acento `#0284c7` solo en el gráfico (4,1:1, no sirve para texto). Archivos en `panel/public/marca` (claro y oscuro, SVG con `title`), componente `componentes/marca.tsx` (logo en el login y en el menú desde 1024 px; solo el isotipo en el menú de tablet), favicon `app/icon.svg` con un corte más grueso para 16 px, `app/apple-icon.png` e íconos para instalar de 192 y 512 px, normales y maskable, en `panel/public/iconos` con `app/manifest.ts` (sin service worker). El Dockerfile copia `public/` porque el servidor `standalone` no la incluye. Parecidos revisados: Mastercard (círculos rellenos), Audi y los aros olímpicos (aros iguales en fila) y el ícono genérico de enlace; antes de registrar la marca conviene una búsqueda formal en la SIC. PR 1 (backend para el dueño): `POST /auth/contrasena` (cualquier usuario con sesión cambia su contraseña con la actual; se cierran sus demás sesiones y se anulan los enlaces pendientes; la sesión actual sigue), `GET /clientes/:id/citas?limite=&desplazamiento=` (historial, la más reciente primero, `{ citas, hayMas }`; el empleado solo ve las de su barbero y un cliente sin citas con él responde 404) y `GET /conversaciones/:id` (solo el dueño). **Panel web completo (PR 1 a 6 de 6); falta desplegarlo.** PR 6: pantalla Plan (uso del mes de `GET /negocio/uso` frente a los límites: conversaciones con el asistente, citas creadas y mensajes automáticos sin límite; aviso desde el 80%, igual que el aviso de WhatsApp; qué pasa al llegar al límite; estado de la cuenta: prueba, activa o suspendida) y despliegue del panel: `panel/Dockerfile` (Next.js `standalone`, usuario `node`, healthcheck a `/login`), servicio `panel` en `docker-compose.prod.yml` (`BACKEND_URL=http://api:3000`, `SALTOS_PROXY=1`) y sitio `{$DOMINIO_PANEL}` en el Caddyfile. `DOMINIO_PANEL` (app.turnooapp.com) debe coincidir con `PANEL_URL` del backend. Probado: el build de producción y el servidor `standalone` (login 200 con cabeceras de seguridad, redirección sin sesión, estáticos); la imagen de Docker la construye el usuario. Antes de desplegar se pule el frontend (decidido el 8 de noviembre de 2026). PR 5: Mensajes muestra por defecto las conversaciones que el asistente pasó a una persona (estado `humano`, con el motivo y lo que pidió) y `?ver=todas` incluye las del asistente; la barra cuenta las que esperan. En la conversación: historial (notas de voz con su transcripción; las imágenes solo con su rótulo hasta que exista la ruta para verlas), hasta cuándo calla el asistente (pasado ese tiempo vuelve a responder cuando el cliente escriba) y el formulario para responder por WhatsApp, que solo aparece dentro de las 24 h desde el último mensaje del cliente. Responder toma la conversación (el asistente calla las horas del negocio). Si Meta rechaza el envío, el mensaje queda como "No se entregó". El backend no tiene `GET /conversaciones/:id`: los datos del cliente salen de la lista (las 100 más recientes). Base de conocimiento: espacio usado (redondeado hacia arriba), agregar, editar, pausar (el asistente no la usa) y borrar con confirmación. Pruebas: el backend de e2e (`pruebas/e2e/servidor.ts`) arranca la app con un Meta de prueba (rechaza un texto con "FALLA-META") y sin las tareas programadas, para que ninguna prueba escriba a WhatsApp. PR 4b (administración): barberos (agregar, renombrar, desactivar con confirmación —el backend lo rechaza si tiene citas futuras— y activar), sus servicios (precio escrito como "25.000"; cambiarlo no toca las citas ya agendadas), su horario semanal por días (al quitar un rango se listan las citas que quedaron fuera, sin cancelarlas) y quién entra al panel como ese barbero. Usuarios: lista con rol y estado; invitar (barbero o dueño; el barbero debe tener con qué barbero atiende) entrega un enlace para copiar o enviar por WhatsApp que el panel no guarda; a un barbero activo, enlace para nueva contraseña; a uno pendiente o desactivado, reenviar invitación; desactivar con confirmación, nunca a uno mismo. A otro dueño no se le generan enlaces (regla del backend). Ajustes: nombre, WhatsApp de avisos y zona horaria, y las reglas de la agenda agrupadas en palabras del dueño; se envía solo lo que cambió. El PR 4 se dividió en dos: 4a (operación del dueño) y 4b (administración: barberos, servicios, horarios, usuarios e invitaciones, ajustes del negocio). PR 4a: el dueño filtra Hoy y Agenda por barbero (`?barbero=`, se ignora si no es un barbero activo; sin filtro con un solo barbero). Citas por aprobar de los próximos 60 días (el backend lista hasta 62 por consulta), la que vence primero arriba, con cuenta regresiva que se actualiza sola (urgente con menos de una hora) y aprobar o rechazar (con confirmación). La barra muestra cuántas hay ("9+" desde 10); si esa consulta falla, el panel se muestra sin el número. El dueño edita nombre, teléfono y notas del cliente, y borra sus datos (anonimizar, con confirmación; el backend lo rechaza si tiene citas activas). PR 3: bloqueos de los próximos 60 días con las citas que se cruzan (el bloqueo no las cancela: se muestran con enlace para reprogramarlas o cancelarlas); el barbero bloquea su agenda y el dueño elige un barbero o todo el negocio; un cierre del negocio lo ve el barbero pero solo el dueño lo quita. Clientes con búsqueda y paginación (el barbero, solo los suyos) y su ficha con llamar y WhatsApp. Editar y anonimizar clientes queda para la vista del dueño (PR 4). No se agrega "agendarle una cita" desde la ficha: precargar el teléfono pondría un dato personal en la URL. PR 2: Hoy y Agenda (lista de tarjetas por hora en la zona del negocio, con la línea de "ahora" y una tira de días en la URL), detalle de la cita con completada, no asistió (con confirmación y corrección entre las dos), cancelar (con confirmación; el cliente no recibe aviso automático), aprobar y rechazar, reprogramar con las horas libres del mismo barbero y servicios, y Nueva cita (barbero, servicios, día, hora y teléfono del cliente; las reglas las aplica el backend). Para eso el detalle de la cita trae `servicioId` en cada servicio (PR del backend aparte). Decisiones del 8 de noviembre de 2026 (todas las recomendadas): carpeta `panel/`; el panel hace de intermediario y guarda el token en una cookie `HttpOnly` y `SameSite=Lax` (sin CORS ni token en el navegador); Server Components para leer y Server Actions para actuar, con los filtros en la URL; Tailwind CSS 4 con colores como variables y unos pocos componentes propios, íconos de lucide-react; azul `#0369A1`, fuente del sistema, solo tema claro; barra inferior de 5 pestañas en el celular y lateral en escritorio; agenda como lista de tarjetas; "olvidé mi contraseña" pide el enlace al dueño hasta que haya correo; el superadmin no tiene panel en la versión 1; Vitest para la lógica y Playwright de punta a punta contra `turnoo_test`; "Nueva cita" simple (cliente, servicio, barbero y hora) con las reglas del backend. El panel reenvía al backend la IP real del usuario (`X-Forwarded-For` calculado con `SALTOS_PROXY`, descartando lo que escribe el navegador): las pruebas comprueban que frenar a una IP no frena a otra y que una cabecera falsificada no salta el límite. Orden de los PR: 1 acceso → 2 agenda de hoy, acciones, próximos días y nueva cita → 3 bloqueos y clientes → 4 vista del dueño → 5 conversaciones y base de conocimiento → 6 plan y despliegue del panel. **El backend quedó completo para el panel** (decidido el 8 de noviembre de 2026, antes del PR 2): `GET /auth/yo` devuelve también `negocio: { nombre, zonaHoraria }` (null para el superadmin), porque el barbero necesita la zona horaria para saber qué es "hoy" y `GET /negocio` es solo del dueño; y `GET /negocio/uso` (solo dueño) devuelve el mes actual en la zona del negocio, el plan con `maxConversacionesIa` y `maxCitasMes` (null sin plan) y el uso (`conversacionesIa`, `citasCreadas`, `plantillasEnviadas`). Mejoras opcionales del backend (imagen de un mensaje, devolver la conversación al asistente) quedan para después de la versión 1.

**Recordatorio de la cita: hecho en código** (decisiones del 7 de noviembre de 2026: borde más cercano, sin envío si se agendó tarde, solo con consentimiento, plantilla completa). `turnoo_recordatorio_cita` está en revisión en Meta (paso 6 de "Conectar una cuenta de WhatsApp"); falta la prueba con WhatsApp real, que cuesta una plantilla.

**Despliegue: archivos hechos, sin servidor todavía.** Dominio comprado el 7 de noviembre de 2026: `turnooapp.com` (la API irá en `api.turnooapp.com` y el panel en `app.turnooapp.com`). La guía `docs/DESPLIEGUE.md` cubre la prueba en el equipo con `DOMINIO_API=localhost`, el primer despliegue, las copias de seguridad, restaurar y actualizar. Falta: construir y probar la imagen en local (no se ha construido todavía), elegir el VPS, y llevar las copias de seguridad fuera del servidor antes de tener clientes reales.

## 7. Pendientes por decidir

- Planes: nombres, precios y límites concretos (la tabla `planes` está vacía a propósito).
- Cómo se factura WhatsApp a Meta para que lo pague Turnoo (por defecto Meta le cobra al dueño de cada cuenta) y cómo se da de alta cada negocio (manual al inicio; el registro integrado de Meta exige verificación de la empresa).
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
