# Convenciones de Turnoo

Reglas para que el código se mantenga ordenado y se entienda a primera vista. Si una regla estorba, se discute y se cambia aquí; lo que no se hace es ignorarla en silencio.

## 1. Estructura del backend

```
backend/
├── package.json
├── tsconfig.json                 TypeScript en modo estricto
├── src/
│   ├── index.ts                  Arranque: lee configuración, conecta, levanta el servidor
│   ├── app.ts                    Express: middlewares y registro de rutas
│   ├── config/
│   │   └── entorno.ts            Variables de entorno validadas al arrancar
│   ├── db/
│   │   ├── pool.ts               Conexión a PostgreSQL (rol turnoo_app)
│   │   └── contexto.ts           conNegocio() y conSistema(): transacciones con aislamiento
│   ├── modulos/                  Un módulo por área del negocio
│   │   ├── auth/                 Login, invitaciones, recuperación de contraseña
│   │   ├── negocios/             Negocios, configuración, planes, pagos
│   │   ├── profesionales/        Barberos, servicios, horarios, bloqueos
│   │   ├── clientes/
│   │   ├── citas/                Disponibilidad, crear, cancelar, reprogramar, aprobar
│   │   ├── conversaciones/       Conversaciones, mensajes, derivaciones
│   │   ├── whatsapp/             Webhook, firma de Meta, cliente de la API de Meta
│   │   ├── ia/                   Instrucciones, funciones de la IA, bucle de llamadas
│   │   ├── conocimiento/         Preguntas y respuestas de cada negocio
│   │   └── uso/                  Contadores y límites del plan
│   ├── tareas/                   Tareas programadas (recordatorios, vencimientos, etc.)
│   └── compartido/               Errores, fechas, cifrado, registro de eventos
└── pruebas/
```

Cada módulo tiene la misma forma:

```
modulos/citas/
├── citas.rutas.ts          HTTP: recibe, valida, responde
├── citas.servicio.ts       Lógica del negocio
├── citas.repositorio.ts    SQL
└── citas.tipos.ts          Tipos de TypeScript del módulo
```

## 2. Capas y qué puede hacer cada una

| Capa | Hace | NO hace |
|---|---|---|
| **rutas** | Valida la entrada (con una librería de esquemas, por ejemplo Zod), llama a un servicio, devuelve la respuesta. | Lógica de negocio. SQL. |
| **servicio** | Reglas del negocio, orquesta repositorios dentro de una transacción. | Conocer Express o escribir SQL. |
| **repositorio** | Es el **único** lugar con SQL. Recibe la transacción y devuelve datos tipados. | Reglas de negocio. |
| **ia/herramientas** y **tareas** | Llaman a **servicios**. | Llamar a repositorios directamente ni escribir SQL. |

Así, una regla (por ejemplo "cancelar solo hasta 2 horas antes") vive en un único lugar y la usan igual el panel, la IA y las tareas.

## 3. Nombres

- **Dominio en español**, igual que la base de datos: `cita`, `cliente`, `profesional`, `conversacion`.
- **Términos técnicos en inglés** cuando son estándar: `middleware`, `handler`, `pool`, `webhook`.
- Archivos: minúsculas con puntos, `citas.servicio.ts`.
- Funciones y variables en `camelCase` (`crearCita`), tipos en `PascalCase` (`Cita`), constantes en `MAYUSCULAS_CON_GUION_BAJO`.
- En SQL, `snake_case`. El repositorio convierte a `camelCase` en la frontera, para que el resto del código no vea `snake_case`.
- Nombres que dicen qué hacen: `calcularDisponibilidad`, no `procesar` ni `manejarDatos`.

## 4. Acceso a la base de datos

Esta es la regla más importante del proyecto, porque de ella depende que un negocio nunca vea datos de otro.

- **Todo acceso a datos de un negocio pasa por `conNegocio(negocioId, async (tx) => { ... })`.** Ese ayudante abre una transacción y ejecuta `set_config('app.negocio_id', ..., true)` antes de cualquier consulta.
- **Tareas internas y superadmin usan `conSistema(...)`.** Úsalo solo cuando de verdad haya que cruzar negocios.
- **Nunca se usa el `pool` directamente** fuera de `db/`, salvo para las dos funciones previas al contexto (`fn_buscar_cuenta_whatsapp` y `fn_usuario_para_login`).
- **SQL siempre parametrizado** (`$1`, `$2`). Jamás se arma una consulta concatenando texto con datos del usuario.
- Dinero en pesos enteros, identificadores `uuid`, fechas como instantes en UTC.

## 5. Errores

- Los errores del negocio son clases propias que heredan de `ErrorDominio` (con un código y un mensaje legible): `HorarioNoDisponible`, `LimiteDelPlan`, `TransicionNoPermitida`, `NoEncontrado`, `NoAutorizado`.
- El repositorio traduce los errores de PostgreSQL a errores del dominio: `23P01` (choque de agenda) pasa a `HorarioNoDisponible`, `23505` (duplicado) y `23514` (regla de la base) a su error correspondiente.
- Un único manejador central de Express convierte los errores del dominio en respuestas HTTP. Los errores inesperados devuelven un mensaje genérico y se registran.
- Cuando una función de la IA falla por una regla del negocio, la IA recibe el mensaje del error como resultado, para poder explicárselo al cliente u ofrecer alternativas.

## 6. Fechas y zonas horarias

- En la base y en el código, los instantes van en UTC.
- La conversión a la hora local del negocio (`negocios.zona_horaria`) se hace **solo** en `compartido/tiempo.ts`. Nadie más hace cuentas de fechas por su cuenta.
- Los horarios de trabajo se guardan como hora local (`time`) y se combinan con la fecha y la zona del negocio en ese mismo módulo.

## 7. Configuración y secretos

- Todo secreto o valor que cambie entre entornos va en variables de entorno (`.env`), nunca en el código.
- `config/entorno.ts` valida las variables al arrancar; si falta alguna, la aplicación falla de inmediato con un mensaje claro.
- Cada vez que se agrega una variable, se agrega también a `.env.example` (con un valor de ejemplo, nunca real), en el mismo commit.
- El token de Meta de cada negocio se guarda cifrado; la clave de cifrado vive en una variable de entorno, no en la base de datos.
- No se registran en logs ni el contenido de los mensajes ni teléfonos completos.

## 8. Migraciones de la base de datos

- Archivos numerados en `db/migrations/`: `NNN_descripcion.sql`, aplicados en orden.
- **Una migración ya aplicada no se edita jamás.** Un cambio nuevo es una migración nueva.
- Cada migración va dentro de una transacción (`BEGIN` / `COMMIT`) y trata un solo tema.
- Antes de hacer commit se prueba sobre una base vacía, aplicando todas desde la 001.
- Si la migración cambia el modelo, se actualiza `docs/ARQUITECTURA.md` en el mismo commit.

## 9. Pruebas

Lo que sí o sí debe tener pruebas, por ser donde un error cuesta caro:

- Cálculo de disponibilidad (horarios, bloqueos, citas existentes, duración total, anticipación).
- Transiciones de estado de la cita y reglas de inasistencias y aprobación.
- Aislamiento entre negocios (que un negocio no vea datos de otro).
- Idempotencia del webhook (el mismo mensaje dos veces no se procesa dos veces).
- Límites del plan.

Las pruebas que involucran la base de datos corren contra un PostgreSQL real en Docker, no contra simulaciones, porque RLS y las restricciones de la base son parte de lo que se prueba.

## 10. Git y GitHub

### Ramas

- `main` siempre está estable: compila y funciona.
- El trabajo se hace en ramas por tema, que se fusionan a `main` cuando la funcionalidad está lista:
  - `feat/<tema>`: funcionalidad nueva (`feat/webhook-whatsapp`)
  - `fix/<tema>`: corrección de un error
  - `docs/<tema>`: solo documentación
  - `chore/<tema>`: configuración, dependencias y mantenimiento

### Mensajes de commit

Formato: `tipo(ámbito): descripción corta, en español y en minúsculas`.

```
feat(citas): calcular disponibilidad por barbero
fix(whatsapp): ignorar mensajes duplicados del webhook
db(migraciones): agregar estado por_aprobar a citas
docs(arquitectura): documentar el flujo de aprobación
chore: configurar TypeScript en modo estricto
```

Tipos: `feat`, `fix`, `db`, `docs`, `refactor`, `test`, `chore`.

### Cuándo hacer commit

Un commit es un paso pequeño, completo y que se pueda describir en una frase. Haz commit:

1. **Cuando algo funciona** y puedes explicarlo en una línea (una función con su prueba, un endpoint que responde bien).
2. **Antes de empezar algo arriesgado** (un cambio grande o una reestructuración), para poder volver atrás.
3. **Cada migración nueva en su propio commit**, separada del código que la usa.
4. **Cada cambio de configuración o dependencia** por separado de la lógica.
5. **Cuando cambias una decisión de diseño**, junto con la actualización de la documentación.

Y no hagas commit de:

- Código que no compila o que rompe lo que antes funcionaba (eso queda en tu rama de trabajo, sin fusionarlo a `main`).
- Varias cosas distintas mezcladas en un solo commit.

**Push:** al terminar cada sesión de trabajo, sube tu rama aunque esté incompleta, para no perder trabajo y mostrar avance constante. Lo que nunca se fusiona a `main` es lo que no está terminado.

### Lo que nunca se sube a GitHub

`.env`, tokens (Meta, IA, correos), claves de cifrado, copias de seguridad de la base, datos reales de clientes y `node_modules`. El `.gitignore` ya cubre lo principal, pero **revisa `git status` antes de cada commit**. Si un secreto llega a subirse por error, hay que **cambiarlo (rotarlo) de inmediato**: borrarlo del historial no basta.

### Antes de cada commit

- [ ] Compila y las pruebas pasan.
- [ ] No quedaron `console.log` de depuración ni código comentado.
- [ ] `git status` y `git diff` revisados: nada que no debía entrar.
- [ ] Si cambió una decisión o el modelo, la documentación está actualizada.
- [ ] Si agregaste una variable de entorno, está en `.env.example`.
