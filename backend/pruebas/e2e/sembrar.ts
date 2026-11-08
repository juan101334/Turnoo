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

async function cita(profesionalId: string, servicio: typeof corte, inicio: DateTime, clienteNombre: string) {
  const id = randomUUID();
  const clienteId = randomUUID();
  const telefono = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const fin = inicio.plus({ minutes: servicio.duracion });
  await conNegocio(negocio.negocioId, async (tx) => {
    await tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [clienteId, negocio.negocioId, clienteNombre, telefono]);
    await tx.consultar(
      `INSERT INTO citas (id, negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado, precio_total_cop, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', $8, 'panel')`,
      [id, negocio.negocioId, negocio.sedeId, profesionalId, clienteId, inicio.toJSDate(), fin.toJSDate(), servicio.precio],
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
  }),
);
