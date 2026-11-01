# Turnoo

Sistema de citas para barberías y salones de belleza. El cliente escribe al WhatsApp del negocio, una IA le responde con información del negocio, le muestra los horarios disponibles y le agenda la cita. El negocio gestiona todo desde un panel web.

Una misma aplicación atiende a varios negocios (multi-negocio / SaaS), cada uno con su número de WhatsApp y sus datos completamente aislados.

## Estado del proyecto

| Parte | Estado |
|---|---|
| Diseño de producto y reglas del negocio | Hecho |
| Base de datos (PostgreSQL, migraciones 001 y 002) | Hecho |
| Backend: esqueleto (configuración, conexión a la base, aislamiento por negocio, errores, `/salud`) | Hecho |
| Backend: webhook de WhatsApp, IA, citas, tareas | Por empezar |
| Panel web (Next.js) | Pendiente |
| Despliegue (VPS con Docker) | Pendiente |

## Stack

- **Backend:** Node.js, TypeScript, Express, SQL directo con `pg`.
- **Base de datos:** PostgreSQL 17 con Row Level Security.
- **Cola y tareas programadas:** pg-boss (propuesto; usa la misma base de datos).
- **Panel:** Next.js.
- **WhatsApp:** API oficial de WhatsApp Cloud (Meta).
- **IA:** modelo de lenguaje con llamadas a funciones (proveedor por definir).
- **Infraestructura:** Docker Compose en un VPS, con proxy inverso HTTPS.

## Cómo levantar la base de datos en tu equipo

Requiere Docker y Docker Compose.

```bash
cp .env.example .env          # y cambia la contraseña dentro de .env
docker compose up -d
docker compose ps             # turnoo-db debe aparecer como "healthy"
```

La base queda disponible en `localhost:5433` (el puerto 5433 evita chocar con un PostgreSQL local en el 5432).

Aplicar las migraciones, en orden:

```bash
docker exec -i turnoo-db psql -U turnoo_admin -d turnoo -v ON_ERROR_STOP=1 < db/migrations/001_init.sql
docker exec -i turnoo-db psql -U turnoo_admin -d turnoo -v ON_ERROR_STOP=1 < db/migrations/002_inasistencias_y_aprobacion.sql
```

Después se le pone contraseña al rol que usa la aplicación, de forma interactiva:

```bash
docker exec -it turnoo-db psql -U turnoo_admin -d turnoo
# dentro de psql:  \password turnoo_app
```

> Según cómo tengas configurado Docker, puede que necesites anteponer `sudo`.

## Estructura del repositorio

```
Turnoo/
├── README.md
├── docker-compose.yml        Base de datos para desarrollo
├── .env.example              Plantilla de variables (el .env real NO se sube)
├── db/
│   └── migrations/           Cambios de la base de datos, numerados y en orden
├── backend/                  API, webhook de WhatsApp, IA y tareas programadas
├── panel/                    Panel web (Next.js)
└── docs/
    ├── ARQUITECTURA.md       Qué hace el sistema y cómo está pensado
    └── CONVENCIONES.md       Cómo se escribe y se versiona el código
```

`panel/` se crea cuando empiece. Para correr el backend, ver [backend/README.md](backend/README.md).

## Documentación

- [Contexto](docs/CONTEXTO.md): punto de partida para retomar el proyecto (decisiones, estado actual y siguiente paso).
- [Arquitectura](docs/ARQUITECTURA.md): decisiones de producto, flujos, estados y modelo de datos.
- [Convenciones](docs/CONVENCIONES.md): organización del código, nombres, errores, migraciones y Git.

## Licencia

Por definir.
