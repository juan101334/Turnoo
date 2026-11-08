/**
 * Datos para las pruebas de punta a punta del panel, en turnoo_test. Borra los de la corrida
 * anterior, crea un negocio con sus usuarios y escribe en la salida un JSON con los correos,
 * la contraseña y los enlaces de un solo uso. Uso: npx tsx pruebas/e2e/sembrar.ts
 */
import './entorno.js';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';

const { conNegocio, conSistema } = await import('../../src/db/contexto.js');
const { pool } = await import('../../src/db/pool.js');
const { generarRecuperacion, invitarUsuario } = await import('../../src/modulos/auth/auth.servicio.js');
const { crearHorario, crearNegocio, crearProfesional, crearServicio } = await import('../ayudas.js');
const { registrarCuenta } = await import('../../src/modulos/whatsapp/whatsapp.cuentas.js');

const DOMINIO = 'e2e.turnoo.test';
const NEGOCIO = 'Barbería E2E';
const clave = `e2e-${randomUUID()}`;
const correo = (quien: string) => `${quien}-${randomUUID().slice(0, 8)}@${DOMINIO}`;

const { rows } = await pool.query<{ base: string }>('SELECT current_database() AS base');
if (!rows[0]?.base.endsWith('_test')) throw new Error(`Solo se siembra una base "*_test" (esta es "${rows[0]?.base}").`);

await conSistema(async (tx) => {
  await tx.consultar('DELETE FROM negocios WHERE nombre = $1', [NEGOCIO]);
  await tx.consultar('DELETE FROM usuarios WHERE email LIKE $1', [`%@${DOMINIO}`]);
  await tx.consultar('DELETE FROM intentos_login');
});

const hash = await argon2.hash(clave);
const negocio = await crearNegocio(NEGOCIO);

async function usuario(rol: 'dueno' | 'empleado', nombre: string, profesionalId?: string) {
  const email = correo(rol);
  const id = await conNegocio(negocio.negocioId, async (tx) => {
    const { rows: filas } = await tx.consultar<{ id: string }>(
      `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [negocio.negocioId, email, nombre, rol, hash],
    );
    const nuevo = filas[0]!.id;
    if (profesionalId) await tx.consultar('UPDATE profesionales SET usuario_id = $1 WHERE id = $2', [nuevo, profesionalId]);
    return nuevo;
  });
  return { id, email };
}

const dueno = await usuario('dueno', 'Dueño E2E');
const barberoE2E = await crearProfesional(negocio, 'Barbero E2E');
const empleado = await usuario('empleado', 'Barbero E2E', barberoE2E);
const barberoDos = await crearProfesional(negocio, 'Barbero Dos');
const recuperable = await usuario('empleado', 'Barbero Olvidadizo', await crearProfesional(negocio, 'Barbero Olvidadizo'));
const limite = await usuario('empleado', 'Barbero Límite', await crearProfesional(negocio, 'Barbero Límite'));

const superadmin = { email: correo('superadmin') };
await conSistema((tx) =>
  tx.consultar(
    `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
     VALUES (NULL, $1, 'Superadmin E2E', 'superadmin', true, $2)`,
    [superadmin.email, hash],
  ),
);

const actor = { usuarioId: dueno.id, negocioId: negocio.negocioId, rol: 'dueno' as const, nombre: 'Dueño E2E' };
const invitado = { email: correo('invitado') };
const invitacion = await invitarUsuario(actor, {
  email: invitado.email,
  nombre: 'Barbero Nuevo',
  rol: 'empleado',
  profesionalId: await crearProfesional(negocio, 'Barbero Nuevo'),
});
const recuperacion = await generarRecuperacion(actor, recuperable.id);

// Agenda: servicios, horarios de 08:00 a 20:00 todos los días y citas en la zona del negocio.
const ZONA = 'America/Bogota';
const corte = { id: await crearServicio(negocio, barberoE2E, 'Corte', 30, 25000), nombre: 'Corte', duracion: 30, precio: 25000 };
await crearServicio(negocio, barberoE2E, 'Barba', 20, 15000);
const corteDos = { id: await crearServicio(negocio, barberoDos, 'Corte', 30, 20000), nombre: 'Corte', duracion: 30, precio: 20000 };
for (let dia = 1; dia <= 7; dia++) {
  await crearHorario(negocio, barberoE2E, dia, '08:00', '20:00');
  await crearHorario(negocio, barberoDos, dia, '08:00', '20:00');
}

async function cita(
  profesionalId: string,
  servicio: typeof corte,
  inicio: DateTime,
  clienteNombre: string,
  { estado = 'pendiente', aprobacionExpiraEn = null }: { estado?: 'pendiente' | 'por_aprobar'; aprobacionExpiraEn?: DateTime | null } = {},
) {
  const id = randomUUID();
  const clienteId = randomUUID();
  const telefono = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const fin = inicio.plus({ minutes: servicio.duracion });
  await conNegocio(negocio.negocioId, async (tx) => {
    await tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [clienteId, negocio.negocioId, clienteNombre, telefono]);
    await tx.consultar(
      `INSERT INTO citas (id, negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado, precio_total_cop, origen, aprobacion_expira_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'panel', $10)`,
      [id, negocio.negocioId, negocio.sedeId, profesionalId, clienteId, inicio.toJSDate(), fin.toJSDate(), estado, servicio.precio, aprobacionExpiraEn?.toJSDate() ?? null],
    );
    await tx.consultar(
      `INSERT INTO cita_servicios (cita_id, servicio_id, negocio_id, profesional_id, nombre, duracion_minutos, precio_cop)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, servicio.id, negocio.negocioId, profesionalId, servicio.nombre, servicio.duracion, servicio.precio],
    );
  });
  return id;
}

const ahora = DateTime.now().setZone(ZONA);
// Empezó hace 30 minutos: se puede marcar. Cae en "hoy" salvo en la primera media hora del día.
await cita(barberoE2E, corte, ahora.minus({ minutes: 30 }).startOf('minute'), 'Cliente Pasado');
const pasadoManana = ahora.plus({ days: 2 }).startOf('day');
await cita(barberoE2E, corte, pasadoManana.set({ hour: 10 }), 'Cliente Futuro');
await cita(barberoE2E, corte, pasadoManana.set({ hour: 11 }), 'Cliente Reprogramar');
const citaAjena = await cita(barberoDos, corteDos, pasadoManana.set({ hour: 10 }), 'Cliente De Otro');

// Por aprobar, en otro día para no cambiar la agenda de pasado mañana. La de Rechazar vence antes:
// va primero en la lista y se marca como urgente (menos de una hora).
const enTresDias = ahora.plus({ days: 3 }).startOf('day');
await cita(barberoE2E, corte, enTresDias.set({ hour: 10 }), 'Cliente Aprobar', { estado: 'por_aprobar', aprobacionExpiraEn: ahora.plus({ hours: 2 }) });
await cita(barberoDos, corteDos, enTresDias.set({ hour: 11 }), 'Cliente Rechazar', { estado: 'por_aprobar', aprobacionExpiraEn: ahora.plus({ minutes: 30 }) });

// Clientes sin citas, para editarlos y anonimizarlos.
async function clienteSinCitas(nombre: string) {
  const id = randomUUID();
  const telefono = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  await conNegocio(negocio.negocioId, (tx) =>
    tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [id, negocio.negocioId, nombre, telefono]),
  );
  return id;
}
const clienteEditable = await clienteSinCitas('Cliente Editable');
const clienteBorrable = await clienteSinCitas('Cliente Borrable');

// Conversaciones de WhatsApp. La cuenta usa un token de mentira: el backend de e2e envía a un Meta
// de prueba (ver servidor.ts), nunca al real.
const cuenta = await registrarCuenta(negocio.negocioId, {
  phoneNumberId: `e2e-${randomUUID().slice(0, 8)}`,
  wabaId: 'e2e-waba',
  numeroVisible: '3000000000',
  token: 'token-de-mentira-e2e',
});

type Linea = [emisor: 'cliente' | 'ia' | 'humano', texto: string, haceMinutos: number];

async function conversacionCon(
  clienteNombre: string,
  estado: 'bot' | 'humano',
  lineas: Linea[],
  derivacion?: { motivo: string; detalle: string },
) {
  const clienteId = randomUUID();
  const telefono = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const momento = (min: number) => ahora.minus({ minutes: min }).toJSDate();
  const ultimoDelCliente = lineas.filter(([e]) => e === 'cliente').at(-1);
  return conNegocio(negocio.negocioId, async (tx) => {
    await tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [clienteId, negocio.negocioId, clienteNombre, telefono]);
    const { rows: filas } = await tx.consultar<{ id: string }>(
      `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, estado, humano_desde, ultimo_mensaje_cliente_en, ultimo_mensaje_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        negocio.negocioId,
        clienteId,
        cuenta.id,
        estado,
        estado === 'humano' ? momento(lineas.at(-1)![2]) : null,
        ultimoDelCliente ? momento(ultimoDelCliente[2]) : null,
        momento(lineas.at(-1)![2]),
      ],
    );
    const id = filas[0]!.id;
    for (const [emisor, texto, min] of lineas) {
      await tx.consultar(
        `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, estado_entrega, creado_en)
         VALUES ($1, $2, $3, $4, 'texto', $5, $6, $7)`,
        [negocio.negocioId, id, emisor === 'cliente' ? 'entrante' : 'saliente', emisor, texto, emisor === 'cliente' ? null : 'entregado', momento(min)],
      );
    }
    if (derivacion) {
      await tx.consultar('INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle) VALUES ($1, $2, $3, $4)', [
        negocio.negocioId,
        id,
        derivacion.motivo,
        derivacion.detalle,
      ]);
    }
    return id;
  });
}

const conversaciones = {
  derivada: await conversacionCon(
    'Cliente Derivado',
    'humano',
    [
      ['cliente', '¿Tienen parqueadero?', 12],
      ['ia', 'Ya le aviso a alguien del negocio para que te responda.', 11],
    ],
    { motivo: 'sin_informacion', detalle: 'Pregunta si hay parqueadero' },
  ),
  vieja: await conversacionCon('Cliente Antiguo', 'humano', [['cliente', 'Hola, ¿siguen abiertos?', 30 * 60]], {
    motivo: 'cliente_pidio_humano',
    detalle: 'Quiere hablar con una persona',
  }),
  conIa: await conversacionCon('Cliente Con Asistente', 'bot', [
    ['cliente', 'Quiero un corte mañana', 40],
    ['ia', 'Claro, ¿a qué hora te queda bien?', 39],
  ]),
};

await pool.end();
console.log(
  JSON.stringify({
    clave,
    dueno: dueno.email,
    empleado: empleado.email,
    superadmin: superadmin.email,
    limite: limite.email,
    invitacion: { email: invitado.email, token: invitacion.token },
    recuperacion: { email: recuperable.email, token: recuperacion.token },
    agenda: { fecha: pasadoManana.toISODate(), citaAjena },
    clientes: { editable: clienteEditable, borrable: clienteBorrable },
    conversaciones,
  }),
);
