# Contexto de Turnoo

> **Para quien retome el proyecto (persona o asistente de IA): lee este archivo primero.**
> Resume el negocio, las decisiones, el estado actual y el siguiente paso, para no tener que reconstruirlos.
> Detalle técnico completo: [ARQUITECTURA.md](ARQUITECTURA.md) y [CONVENCIONES.md](CONVENCIONES.md).
> Cómo correr cada parte: [README.md](../README.md) y [backend/README.md](../backend/README.md).
>
> **Última actualización:** fin de la sesión 1 (ver el registro al final). Quien trabaje en el proyecto
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

**Tecnología:** Node.js 22 + TypeScript (módulos ES, imports con extensión `.js`) + Express 5 + SQL directo con `pg` (sin ORM). PostgreSQL 17 en Docker (puerto **5433** en el equipo de desarrollo). Panel en Next.js (aún no creado). Cola de trabajos y tareas programadas con pg-boss (propuesto, usa la misma base de datos). Despliegue en un VPS con Docker Compose y Caddy para HTTPS. Un solo repositorio con `backend/` y `panel/`.

**WhatsApp:** API oficial (Cloud API de Meta). Un número por negocio (`whatsapp_cuentas`); el modelo permite un número por barbero (`profesional_id` opcional) pero no se implementa en el MVP.

**Aislamiento entre negocios (la regla más importante):** `negocio_id` en toda tabla + Row Level Security forzado + claves foráneas compuestas `(negocio_id, id)`. La aplicación se conecta con el rol `turnoo_app` (sin superusuario, no puede saltarse el RLS). **Todo acceso a datos pasa por `conNegocio(negocioId, async (tx) => ...)`** (o `conSistema` para superadmin y tareas internas) en `backend/src/db/contexto.ts`. Solo dos consultas ocurren antes de conocer el negocio: `buscarCuentaWhatsapp` y `usuarioParaLogin` (`db/previas.ts`).

**Agenda:**

- Cada barbero tiene su horario de trabajo (varios rangos por día, el almuerzo es el hueco), bloqueos (días libres, festivos, cierres del negocio) y **sus propios servicios**, con su duración y precio.
- Una cita es de **una persona**, con uno o varios servicios **del mismo barbero**; la duración total es la suma. Un cliente puede agendar varias citas seguidas.
- Una sede por negocio por ahora (el modelo ya soporta varias).
- Valores por defecto, configurables por negocio en `configuracion_negocio`: citas cada 15 min, anticipación mínima 1 h y máxima 30 días, máximo 2 citas activas por cliente, cancelar o reprogramar por WhatsApp hasta 2 h antes, recordatorio ~11 h antes.
- Los horarios se alinean al reloj (08:00, 08:15, ...) aunque la cita anterior termine a una hora "rara".

**Estados de la cita:** `por_aprobar`, `pendiente`, `confirmada` (fase 2), `completada`, `cancelada` (final), `no_asistio`. Un trigger de la base valida las transiciones. Una restricción de exclusión (`citas_sin_solapes`) impide citas dobles contando `por_aprobar`, `pendiente` y `confirmada`.

**Inasistencias:** el barbero marca "no asistió" con un toque; si no marca nada en 24 h la cita se completa sola. Con 3 inasistencias en 30 días del mismo cliente en ese negocio, sus citas nuevas quedan `por_aprobar`: reservan el hueco, el barbero tiene 2 h para aprobar (nunca más allá de 1 h antes de la cita) y si no responde se libera y se avisa al cliente. Las banderas son **por negocio**, no se comparten entre negocios (privacidad). Las inasistencias se cuentan desde las citas, no hay contador.

**IA:** habla solo de temas del negocio usando una base de conocimiento por negocio; si no sabe, deriva a una persona en lugar de inventar. Al derivar, la conversación pasa a `humano` (la IA calla), se avisa al dueño por WhatsApp con plantilla y vuelve sola a la IA a las 2 h. En el MVP no hay bandeja de chats: la persona contacta al cliente por fuera. **El backend, nunca la IA, pone el negocio y el cliente.** Funciones de la IA: `listar_profesionales_y_servicios`, `consultar_disponibilidad`, `crear_cita`, `listar_mis_citas`, `cancelar_cita`, `reprogramar_cita`, `derivar_a_humano`. Los audios se transcriben (servicio aparte); las imágenes se guardan y se adjuntan a la cita.

**Recordatorio:** uno solo, ~11 h antes, con plantilla de WhatsApp (casi siempre cae fuera de la ventana de 24 h, así que tiene costo). No se envía de noche (07:00 a 21:00, valor propuesto que falta validar).

**Datos personales:** aviso de tratamiento de datos en el primer mensaje; se entiende aceptado al seguir conversando (decisión de Juan José; se le advirtió del riesgo con la Ley 1581 de 2012 y que debe revisarse con un abogado). Se registra en `consentimientos`.

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
| **113 pruebas automáticas en verde** (85 + 28 de gestión de citas) contra una base `turnoo_test` aparte | `backend/pruebas/` |

**Pendiente de confirmar al abrir una sesión nueva:** que la rama `feat/disponibilidad-citas` ya esté fusionada a `main` (ejecutar `git status` y `git log --oneline -5`).

**No existe todavía:** webhook de WhatsApp, integración de la IA, tareas programadas, autenticación, rutas HTTP de negocio (`citas.rutas.ts`), panel, despliegue.

**Comandos habituales** (desde `backend/`):

```bash
npm run dev           # servidor con recarga
npm run typecheck     # tipos de todo el código, pruebas incluidas
npm run db:pruebas    # recrea turnoo_test aplicando todas las migraciones (tras cada migración nueva)
npm test              # 113 pruebas
```

Aplicar una migración nueva a la base de desarrollo (desde la raíz):

```bash
sudo docker exec -i turnoo-db psql -U turnoo_admin -d turnoo -v ON_ERROR_STOP=1 < db/migrations/NNN_nombre.sql
```

## 5. Siguiente paso: crear, cancelar, reprogramar y aprobar citas

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

**Reprogramar:** cambia `inicio` y `fin` de la misma cita, reinicia `recordatorio_enviado_en` y revalida la disponibilidad **excluyendo la propia cita** (hay que agregar un parámetro `excluirCitaId` a `obtenerOcupados` y a la consulta). Mismas reglas de plazo que cancelar.

**Aprobar o rechazar** (`por_aprobar`): aprobar pasa a `pendiente` y limpia `aprobacion_expira_en`; rechazar pasa a `cancelada` con `cancelada_por = 'negocio'`.

**Marcar** `completada` o `no_asistio`: solo el negocio. El autocompletado a las 24 h será una tarea programada.

**Decisión abierta para este paso:** si una cita `por_aprobar` no alcanza el margen mínimo (el plazo calculado ya pasó), se propone rechazarla con el mensaje de que debe comunicarse con el negocio. Confirmar con Juan José.

Cada regla necesita su prueba (en `backend/pruebas/`) y, para las más importantes, una verificación de que la prueba falla si se rompe la regla.

## 6. Hoja de ruta

1. **MVP (en curso):** multi-negocio con login y roles, webhook seguro, IA con funciones, servicios, barberos y horarios, panel básico de citas, recordatorio, derivación con aviso al dueño, conteo de uso y límites por plan.
2. **Fase 2:** bandeja de chats, botones de confirmar o cancelar en el recordatorio, lista de espera, ficha del cliente.
3. **Fase 3:** pagos o anticipos con pasarela (por ejemplo Wompi), reactivación de clientes, reseñas y métricas.

Orden previsto del MVP: citas (crear, cancelar, reprogramar, aprobar) → autenticación y usuarios → webhook de WhatsApp (firma `X-Hub-Signature-256` sobre el cuerpo sin procesar, idempotencia por `wa_message_id`, cola) → integración de la IA con sus funciones → tareas programadas (recordatorios, aprobaciones vencidas, autocompletar, regreso de modo humano, avisos de derivación) → rutas HTTP y panel Next.js → despliegue con backups.

## 7. Pendientes por decidir

- Planes: nombres, precios y límites concretos (la tabla `planes` está vacía a propósito).
- Cómo se factura WhatsApp a Meta para que lo pague Turnoo (por defecto Meta le cobra al dueño de cada cuenta) y cómo se da de alta cada negocio (manual al inicio; el registro integrado de Meta exige verificación de la empresa).
- Proveedor y modelo de IA, y servicio de transcripción de audio (la API de Claude no recibe audio, como se sabe hasta hoy).
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

## 8.1 Qué funciona ya, en una línea

`consultarDisponibilidad(negocioId, { profesionalId, servicioIds, desde, hasta })` devuelve, por día, las horas en que puede empezar una cita para esa combinación de servicios, descontando horario del barbero, bloqueos y citas activas, con intervalo alineado al reloj y respetando anticipación mínima y máxima.

## 9. Mapa de archivos

```
Turnoo/
├── README.md, docker-compose.yml, .env.example, .gitignore
├── db/migrations/            001_init.sql, 002_inasistencias_y_aprobacion.sql
├── docs/                     CONTEXTO.md (este), ARQUITECTURA.md, CONVENCIONES.md
└── backend/
    ├── package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, .env.example
    ├── scripts/preparar-base-pruebas.ts
    ├── pruebas/              ayudas.ts, configuracion.ts y los *.test.ts
    └── src/
        ├── index.ts, app.ts
        ├── config/entorno.ts
        ├── db/               pool.ts, contexto.ts, previas.ts
        ├── compartido/       errores.ts, logger.ts, tiempo.ts, validacion.ts
        └── modulos/citas/    disponibilidad.ts, citas.servicio.ts, citas.repositorio.ts, citas.tipos.ts
```

## 10. Cómo mantener este archivo y registro de sesiones

Al terminar cada sesión de trabajo: actualizar la sección 4 (estado), la 5 (siguiente paso), la 7 (pendientes) y agregar una línea al registro. Si una decisión cambia, corregirla aquí y en ARQUITECTURA.md en el mismo commit.

| Sesión | Qué se hizo |
|---|---|
| 1 | Se eligió la idea y se definió todo el producto con preguntas por rondas. Se diseñó y se aplicó la base de datos (migraciones 001 y 002), se escribió la guía (README, ARQUITECTURA, CONVENCIONES), se montó el esqueleto del backend con aislamiento por negocio, se agregaron 85 pruebas automáticas y se construyó el cálculo de disponibilidad de citas. |
| 2 | Se implementó el segundo tramo del módulo de citas (crear, cancelar, reprogramar, aprobar/rechazar, marcar) con 28 pruebas nuevas; se verificó rompiendo cada regla a propósito. Decisiones: una `por_aprobar` sin tiempo para el plazo se rechaza con mensaje de contactar al negocio; `por_aprobar` no se reprograma; marcar solo desde la hora de inicio; el límite del plan se cuenta de forma atómica al final de la transacción. Siguiente: autenticación o webhook de WhatsApp (sección 6). |
