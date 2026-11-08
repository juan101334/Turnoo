/**
 * Datos para las pruebas de punta a punta del panel, en turnoo_test. Borra los de la corrida
 * anterior, crea un negocio con sus usuarios y escribe en la salida un JSON con los correos,
 * la contraseña y los enlaces de un solo uso. Uso: npx tsx pruebas/e2e/sembrar.ts
 */
import './entorno.js';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const { conNegocio, conSistema } = await import('../../src/db/contexto.js');
const { pool } = await import('../../src/db/pool.js');
const { generarRecuperacion, invitarUsuario } = await import('../../src/modulos/auth/auth.servicio.js');
const { crearNegocio, crearProfesional } = await import('../ayudas.js');

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
const empleado = await usuario('empleado', 'Barbero E2E', await crearProfesional(negocio, 'Barbero E2E'));
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
  }),
);
