/**
 * Datos de mentira para las capturas de la landing (landing/public/capturas), en turnoo_test:
 * una barbería inventada con tres barberos, la agenda de mañana, conversaciones y base de
 * conocimiento. Ningún nombre ni teléfono es de una persona real. Escribe en la salida un JSON
 * con el correo y la contraseña del dueño. Lo usa panel/e2e/capturas-landing.spec.ts.
 */
import './entorno.js';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';

const { conNegocio, conSistema } = await import('../../src/db/contexto.js');
const { pool } = await import('../../src/db/pool.js');
const { crearHorario, crearNegocio, crearProfesional, crearServicio } = await import('../ayudas.js');
const { registrarCuenta } = await import('../../src/modulos/whatsapp/whatsapp.cuentas.js');

const NEGOCIO = 'Barbería La Esquina';
const CORREO = 'dueno@capturas.turnoo.test';
const ZONA = 'America/Bogota';
const clave = `capturas-${randomUUID()}`;

const { rows } = await pool.query<{ base: string }>('SELECT current_database() AS base');
if (!rows[0]?.base.endsWith('_test')) throw new Error(`Solo se siembra una base "*_test" (esta es "${rows[0]?.base}").`);

await conSistema(async (tx) => {
  await tx.consultar('DELETE FROM negocios WHERE nombre = $1', [NEGOCIO]);
  await tx.consultar('DELETE FROM usuarios WHERE email = $1', [CORREO]);
});

const negocio = await crearNegocio(NEGOCIO);
const id = negocio.negocioId;
await conSistema(async (tx) => {
  const { rows: planes } = await tx.consultar<{ id: string }>(`SELECT id FROM planes WHERE nombre = 'Barbería'`);
  await tx.consultar(`UPDATE negocios SET estado = 'activo', plan_id = $2, telefono_avisos = '573005550100' WHERE id = $1`, [id, planes[0]?.id ?? null]);
});
await conNegocio(id, async (tx) => {
  await tx.consultar(
    `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Daniela', 'dueno', true, $3)`,
    [id, CORREO, await argon2.hash(clave)],
  );
});

// Barberos, servicios y horario de 8:00 a 20:00 todos los días.
const barberos = {
  andres: await crearProfesional(negocio, 'Andrés'),
  camilo: await crearProfesional(negocio, 'Camilo'),
  julian: await crearProfesional(negocio, 'Julián'),
};
type Servicio = { id: string; nombre: string; duracion: number; precio: number };
const servicios: Record<string, Record<'corte' | 'barba' | 'combo', Servicio>> = {};
for (const [clave_, barbero] of Object.entries(barberos)) {
  const servicio = async (nombre: string, duracion: number, precio: number): Promise<Servicio> => ({
    id: await crearServicio(negocio, barbero, nombre, duracion, precio),
    nombre,
    duracion,
    precio,
  });
  servicios[clave_] = {
    corte: await servicio('Corte', 30, 25000),
    barba: await servicio('Barba', 20, 15000),
    combo: await servicio('Corte y barba', 45, 35000),
  };
  for (let dia = 1; dia <= 7; dia++) await crearHorario(negocio, barbero, dia, '08:00', '20:00');
}

let telefonos = 0;
/** Teléfonos del rango 555, que no se asigna a nadie. */
const telefono = () => `57300555${String(++telefonos).padStart(4, '0')}`;

async function cliente(nombre: string): Promise<string> {
  const clienteId = randomUUID();
  await conNegocio(id, (tx) => tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [clienteId, id, nombre, telefono()]));
  return clienteId;
}

// La agenda de mañana.
const manana = DateTime.now().setZone(ZONA).plus({ days: 1 }).startOf('day');
// Unas confirmadas (el cliente respondió al recordatorio) y otras pendientes, como en un día real.
async function cita(
  barbero: keyof typeof barberos,
  tipo: 'corte' | 'barba' | 'combo',
  hora: string,
  nombre: string,
  { origen = 'whatsapp', estado = 'pendiente' }: { origen?: 'whatsapp' | 'panel'; estado?: 'pendiente' | 'confirmada' } = {},
) {
  const [h, m] = hora.split(':').map(Number);
  const s = servicios[barbero]![tipo];
  const inicio = manana.set({ hour: h!, minute: m! });
  const citaId = randomUUID();
  const clienteId = await cliente(nombre);
  await conNegocio(id, async (tx) => {
    await tx.consultar(
      `INSERT INTO citas (id, negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado, precio_total_cop, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [citaId, id, negocio.sedeId, barberos[barbero], clienteId, inicio.toJSDate(), inicio.plus({ minutes: s.duracion }).toJSDate(), estado, s.precio, origen],
    );
    await tx.consultar(
      `INSERT INTO cita_servicios (cita_id, servicio_id, negocio_id, profesional_id, nombre, duracion_minutos, precio_cop) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [citaId, s.id, id, barberos[barbero], s.nombre, s.duracion, s.precio],
    );
  });
}
const confirmada = { estado: 'confirmada' } as const;
await cita('andres', 'corte', '09:00', 'Santiago Rojas', confirmada);
await cita('andres', 'combo', '10:00', 'Mateo Giraldo');
await cita('andres', 'corte', '11:30', 'Felipe Cárdenas', { origen: 'panel', estado: 'confirmada' });
await cita('andres', 'barba', '14:00', 'Juan Pablo Ortiz', confirmada);
await cita('andres', 'combo', '16:00', 'Sebastián Mejía');
await cita('camilo', 'combo', '09:30', 'Nicolás Vargas', confirmada);
await cita('camilo', 'corte', '11:00', 'David Salazar');
await cita('camilo', 'corte', '13:30', 'Esteban Londoño', { origen: 'panel', estado: 'confirmada' });
await cita('camilo', 'combo', '15:00', 'Alejandro Pineda');
await cita('julian', 'corte', '10:00', 'Tomás Restrepo');
await cita('julian', 'barba', '10:45', 'Samuel Quintero', confirmada);
await cita('julian', 'combo', '12:00', 'Miguel Ángel Suárez');
await cita('julian', 'corte', '15:30', 'Daniel Castaño', confirmada);
await cita('julian', 'corte', '17:00', 'Simón Arango', { origen: 'panel' });

// Lo que el asistente sabe del negocio.
await conNegocio(id, async (tx) => {
  for (const [pregunta, respuesta] of [
    ['¿Dónde quedan?', 'En la carrera 70 con calle 44, local 102, en Laureles. Hay parqueadero de motos al frente.'],
    ['¿Qué formas de pago reciben?', 'Efectivo, Nequi, Daviplata y tarjeta.'],
    ['¿Atienden niños?', 'Sí, desde los 4 años. El corte para niños vale lo mismo que el de adulto.'],
    ['¿Cuál es el horario?', 'Todos los días de 8:00 a. m. a 8:00 p. m.'],
    ['¿Hacen diseños o cejas?', 'Sí. El diseño va incluido en el corte; las cejas valen $5.000 adicionales.'],
  ]) {
    await tx.consultar('INSERT INTO conocimiento (negocio_id, pregunta, respuesta) VALUES ($1, $2, $3)', [id, pregunta, respuesta]);
  }
});

// Conversaciones de WhatsApp: una espera a una persona y dos siguen con el asistente.
const cuenta = await registrarCuenta(id, { phoneNumberId: String(Date.now()), wabaId: '1', numeroVisible: '3005550100', token: 'token-de-mentira-capturas' });
// Hora fija de la tarde (hoy a las 4:20 p. m.), para que las capturas no muestren la hora en que
// se tomaron. El panel solo pinta la hora de cada mensaje, así que da igual si aún no ha llegado.
// Conviene tomarlas antes de las 6:00 p. m.: después, la conversación derivada ya volvió al asistente.
const ahora = DateTime.now().setZone(ZONA).set({ hour: 16, minute: 20, second: 0, millisecond: 0 });
type Linea = [emisor: 'cliente' | 'ia', texto: string, haceMinutos: number];
async function conversacion(nombre: string, estado: 'bot' | 'humano', lineas: Linea[], derivacion?: { motivo: string; detalle: string }) {
  const clienteId = await cliente(nombre);
  const momento = (min: number) => ahora.minus({ minutes: min }).toJSDate();
  const ultimo = lineas.at(-1)![2];
  const ultimoDelCliente = lineas.filter(([e]) => e === 'cliente').at(-1)![2];
  await conNegocio(id, async (tx) => {
    const { rows: filas } = await tx.consultar<{ id: string }>(
      `INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, estado, humano_desde, ultimo_mensaje_cliente_en, ultimo_mensaje_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [id, clienteId, cuenta.id, estado, estado === 'humano' ? momento(ultimo) : null, momento(ultimoDelCliente), momento(ultimo)],
    );
    for (const [emisor, texto, min] of lineas) {
      await tx.consultar(
        `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, estado_entrega, creado_en)
         VALUES ($1, $2, $3, $4, 'texto', $5, $6, $7)`,
        [id, filas[0]!.id, emisor === 'cliente' ? 'entrante' : 'saliente', emisor, texto, emisor === 'cliente' ? null : 'entregado', momento(min)],
      );
    }
    if (derivacion) {
      await tx.consultar('INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle) VALUES ($1, $2, $3, $4)', [id, filas[0]!.id, derivacion.motivo, derivacion.detalle]);
    }
  });
}
await conversacion(
  'Carolina Henao',
  'humano',
  [
    ['cliente', 'Hola, buenas. ¿Ustedes hacen tintura para hombre?', 9],
    ['ia', 'Hola, Carolina. De tintura no tengo información. Ya le aviso a alguien de la barbería para que te responda.', 8],
  ],
  { motivo: 'sin_informacion', detalle: 'Pregunta si hacen tintura para hombre' },
);
await conversacion('Mateo Giraldo', 'bot', [
  ['cliente', 'Buenas, quiero un corte y barba para mañana en la mañana', 46],
  ['ia', 'Hola, Mateo. Mañana con Andrés hay cupo a las 10:00 a. m. y a las 11:30 a. m. ¿Cuál te sirve?', 45],
  ['cliente', 'A las 10', 44],
  ['ia', 'Listo, quedaste mañana a las 10:00 a. m. con Andrés para corte y barba. Vale $35.000.', 43],
]);
await conversacion('Tomás Restrepo', 'bot', [
  ['cliente', '¿Hasta qué hora atienden hoy?', 130],
  ['ia', 'Hoy atendemos hasta las 8:00 p. m. ¿Te agendo un turno?', 129],
]);

await pool.end();
console.log(JSON.stringify({ correo: CORREO, clave, fecha: manana.toISODate() }));
