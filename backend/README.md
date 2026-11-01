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
| `npm run typecheck` | Revisa los tipos sin generar archivos. |
| `npm run build` | Compila a `dist/`. |
| `npm start` | Corre lo compilado (`dist/`). |

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
└── compartido/
    ├── errores.ts         Errores del negocio y traducción de errores de PostgreSQL
    └── logger.ts          Registro de eventos (oculta datos sensibles)
```

Los módulos del negocio (`modulos/`) y las tareas programadas (`tareas/`) se agregan a medida que se construyen.

## La regla más importante

Todo acceso a datos de un negocio pasa por `conNegocio(negocioId, async (tx) => { ... })`. Así PostgreSQL aplica Row Level Security y un negocio nunca ve datos de otro. Ver la sección 4 de [CONVENCIONES](../docs/CONVENCIONES.md).
