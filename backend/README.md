# Backend de Turnoo

API, webhook de WhatsApp, IA y tareas programadas. TypeScript sobre Node.js, con Express y SQL directo (`pg`).

Para entender el diseño completo, ver [docs/ARQUITECTURA.md](../docs/ARQUITECTURA.md) y [docs/CONVENCIONES.md](../docs/CONVENCIONES.md).

## Requisitos

- Node.js 22 o superior (`node -v`).
- La base de datos de Turnoo levantada y con las migraciones aplicadas (ver el README de la raíz).
- La contraseña del rol `turnoo_app` ya definida.

## Puesta en marcha

```bash
cd backend
npm install
cp .env.example .env      # y edita DATABASE_URL con la contraseña de turnoo_app
npm run dev
```

Comprueba que responde:

```bash
curl localhost:3000/salud
# {"estado":"ok"}
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca con recarga automática y registros legibles. |
| `npm run typecheck` | Revisa los tipos de todo el código (incluidas las pruebas). |
| `npm run build` | Compila `src/` a `dist/`. |
| `npm start` | Corre lo compilado (`dist/`). |
| `npm run superadmin -- correo "Nombre"` | Crea el primer superadmin e imprime el enlace para fijar su contraseña. |
| `npm run db:pruebas` | Crea desde cero la base `turnoo_test` y le aplica las migraciones. |
| `npm test` | Corre todas las pruebas automáticas. |
| `npm run test:watch` | Corre las pruebas y las repite al guardar cambios. |

## Pruebas automáticas

Las pruebas corren contra una base de datos PostgreSQL real llamada `turnoo_test`, en el mismo servidor de Docker pero **separada de tu base de desarrollo** (`turnoo`): nunca la tocan. Hay un seguro que aborta si la base no termina en `_test`.

```bash
npm run db:pruebas   # una vez, y cada vez que agregues una migración
npm test
```

`db:pruebas` usa las credenciales de administrador del `.env` de la raíz (`POSTGRES_USER` y `POSTGRES_PASSWORD`) para crear la base.

Qué verifican hoy (`pruebas/`):

- **aislamiento:** un negocio no ve, escribe ni modifica datos de otro; las claves foráneas impiden mezclar negocios; funciones previas al contexto.
- **citas:** no hay citas dobles, las canceladas liberan el hueco, las transiciones de estado válidas e inválidas, y los servicios de una cita deben ser del mismo barbero.
- **horarios:** rangos válidos y rangos que se cruzan.
- **negocios y usuarios:** sede y configuración por defecto, reglas de roles y formato del teléfono.
- **mensajes:** un mensaje reenviado por Meta no se duplica; coherencia entre emisor y dirección; modo humano.
- **disponibilidad:** horarios libres según el horario del barbero, bloqueos, citas activas (incluidas las `por_aprobar`), duración total de varios servicios, intervalo alineado al reloj, anticipación mínima y máxima, y validación de la consulta. El cálculo puro se prueba sin base de datos; el servicio, contra la base real.
- **gestión de citas:** crear, cancelar, reprogramar, aprobar, rechazar y marcar, con sus reglas.
- **autenticación:** sesiones, invitaciones, recuperación de contraseña y sus rutas HTTP.
- **clientes:** normalización del teléfono y `obtenerOCrearCliente`.
- **rutas de citas:** operaciones por HTTP y permisos de dueño y empleado.
- **rutas de negocios:** alta, plan y estado por el superadmin; datos y configuración por el dueño; permisos y negocio suspendido.
- **barberos y usuarios:** administración de barberos, límite del plan, citas futuras, asociación con usuarios, invitar, desactivar, reenviar invitación y último dueño activo, incluidas operaciones simultáneas.
- **tareas internas:** autocompletar, expirar y limpiar con sus límites exactos, negocios suspendidos, dos instancias a la vez, un barbero cambiando la misma cita, log sin datos personales y programador.
- **límite de login:** contadores por cuenta e IP, por cuenta y por IP; ventana de tiempo, peticiones simultáneas, IPv6 y `X-Forwarded-For` falsificado.
- **rutas de clientes:** permisos de dueño y empleado, búsqueda, edición, anonimización, negocio suspendido y carreras entre agendar y anonimizar.
- **servicios, horarios y bloqueos:** gestión por dueño y empleado, citas afectadas, zona horaria del negocio, negocio suspendido, barbero desactivado y el recorrido completo desde crear un barbero hasta agendar.

## Qué hay hecho

```
src/
├── index.ts               Arranque y apagado ordenado
├── app.ts                 Express, ruta /salud y manejo central de errores
├── config/entorno.ts      Variables de entorno validadas al arrancar
├── db/
│   ├── pool.ts            Conexión a PostgreSQL (rol turnoo_app)
│   ├── contexto.ts        conNegocio() y conSistema(): aislamiento entre negocios
│   └── previas.ts         Las dos consultas anteriores al contexto (webhook y login)
├── tareas/
│   ├── tareas.ts          Autocompletar, expirar, limpiar y el ciclo que las corre
│   └── programador.ts     Temporizador que inicia index.ts
├── modulos/
│   ├── auth/
│   │   ├── auth.rutas.ts           Rutas /auth/*
│   │   ├── auth.middleware.ts      exigirSesion y exigirRol
│   │   ├── auth.servicio.ts        Login, sesiones, invitaciones, recuperación y administración de usuarios
│   │   ├── auth.intentos.ts        Límite de intentos de login
│   │   ├── auth.repositorio.ts     SQL del módulo
│   │   └── auth.tipos.ts           Tipos del módulo
│   ├── citas/
│   │   ├── citas.rutas.ts          Rutas /citas para el panel, con permisos por rol
│   │   ├── disponibilidad.ts       Cálculo puro de horarios libres (sin base de datos)
│   │   ├── citas.servicio.ts       Disponibilidad, crear, cancelar, reprogramar, aprobar, rechazar y marcar
│   │   ├── citas.repositorio.ts    SQL del módulo
│   │   └── citas.tipos.ts          Tipos del módulo
│   ├── clientes/
│   │   ├── clientes.rutas.ts       Rutas /clientes para el panel, con permisos por rol
│   │   ├── clientes.servicio.ts    Teléfono, obtenerOCrearCliente, listar, editar y anonimizar
│   │   ├── clientes.repositorio.ts SQL del módulo
│   │   └── clientes.tipos.ts       Tipos del módulo
│   ├── negocios/
│   │   ├── negocios.rutas.ts       Rutas /negocios (superadmin) y /negocio (dueño)
│   │   ├── negocios.servicio.ts    Alta, plan y estado, datos del negocio y configuración
│   │   ├── negocios.reglas.ts      Estado del negocio, para usar desde otros módulos
│   │   ├── negocios.repositorio.ts SQL del módulo
│   │   └── negocios.tipos.ts       Tipos del módulo
│   └── profesionales/
│       ├── agenda.rutas.ts              Servicios y horarios de un barbero, y rutas /bloqueos
│       ├── agenda.servicio.ts           Reglas de la agenda y citas afectadas
│       ├── agenda.repositorio.ts        SQL de la agenda
│       ├── agenda.tipos.ts              Tipos de la agenda
│       ├── profesionales.rutas.ts       Rutas /profesionales
│       ├── profesionales.servicio.ts    Administrar barberos y asociarlos a un usuario
│       ├── profesionales.reglas.ts      Asociación, para usar también desde auth
│       ├── profesionales.repositorio.ts SQL del módulo
│       └── profesionales.tipos.ts       Tipos del módulo
└── compartido/
    ├── errores.ts         Errores del negocio y traducción de errores de PostgreSQL
    ├── logger.ts          Registro de eventos (oculta datos sensibles)
    ├── tiempo.ts          ÚNICO lugar con cuentas de fechas y zonas horarias
    └── validacion.ts      Validaciones pequeñas (uuid y esquemas de Zod)

scripts/
├── preparar-base-pruebas.ts   Recrea la base turnoo_test
└── crear-superadmin.ts        Crea el primer superadmin
```

Los demás módulos del negocio (`modulos/`) y las tareas con WhatsApp (`tareas/`) se agregan a medida que se construyen.

## La regla más importante

Todo acceso a datos de un negocio pasa por `conNegocio(negocioId, async (tx) => { ... })`. Así PostgreSQL aplica Row Level Security y un negocio nunca ve datos de otro. Ver la sección 4 de [CONVENCIONES](../docs/CONVENCIONES.md).
