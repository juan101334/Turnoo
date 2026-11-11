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
  // Los que crea el superadmin en e2e/superadmin.spec.ts.
  await tx.consultar("DELETE FROM negocios WHERE nombre LIKE 'Barbería Superadmin %'");
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
// Solo para cambiar su contraseña (e2e/cuenta.spec.ts): así no cambia la de los demás.
const cuentaPropia = await usuario('dueno', 'Dueña Cuenta');
const barberoE2E = await crearProfesional(negocio, 'Barbero E2E');
const empleado = await usuario('empleado', 'Barbero E2E', barberoE2E);
const barberoDos = await crearProfesional(negocio, 'Barbero Dos');
const barberoOlvidadizo = await crearProfesional(negocio, 'Barbero Olvidadizo');
const recuperable = await usuario('empleado', 'Barbero Olvidadizo', barberoOlvidadizo);
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
  { estado = 'pendiente', aprobacionExpiraEn = null }: { estado?: 'pendiente' | 'confirmada' | 'por_aprobar'; aprobacionExpiraEn?: DateTime | null } = {},
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

// Para las pruebas de flujos principales (e2e/flujos.spec.ts), una por tamaño de pantalla: ya
// empezaron, así que se pueden marcar. Seguidas, sin cruzarse, con el Barbero Dos.
await cita(barberoDos, corteDos, ahora.minus({ minutes: 55 }).startOf('minute'), 'Cliente Flujo Escritorio');
await cita(barberoDos, corteDos, ahora.minus({ minutes: 25 }).startOf('minute'), 'Cliente Flujo Celular');

// "Completada" desde la tarjeta de Hoy (e2e/agenda.spec.ts): ya empezaron, sin cruzarse con
// "Cliente Pasado" (el Barbero E2E no puede tener dos citas a la vez).
await cita(barberoE2E, corte, ahora.minus({ minutes: 90 }).startOf('minute'), 'Cliente Deshacer');
await cita(barberoE2E, corte, ahora.minus({ minutes: 60 }).startOf('minute'), 'Cliente Rápido');
// Para el bloque "Sigue" de Hoy: más tarde, con el Barbero Dos (después de "Cliente Flujo Celular").
await cita(barberoDos, corteDos, ahora.plus({ minutes: 40 }).startOf('minute'), 'Cliente Sigue');

// Un día solo para mirar la agenda (e2e/agenda.spec.ts), lejos de los días que cambian otras
// pruebas: una cita por barbero a las 9:00 y el almuerzo del Barbero E2E de 13:00 a 14:00.
const diaDeVista = ahora.plus({ days: 10 }).startOf('day');
await cita(barberoE2E, corte, diaDeVista.set({ hour: 9 }), 'Cliente Vista Uno', { estado: 'confirmada' });
await cita(barberoDos, corteDos, diaDeVista.set({ hour: 9 }), 'Cliente Vista Dos');
// El día siguiente, una cita del Barbero Olvidadizo, que no tiene horario (como si se lo hubieran
// quitado después de agendar): en la grilla no se esconde aunque "no trabaje" ese día.
const corteOlvidadizo = { id: await crearServicio(negocio, barberoOlvidadizo, 'Corte', 30, 20000), nombre: 'Corte', duracion: 30, precio: 20000 };
await cita(barberoOlvidadizo, corteOlvidadizo, diaDeVista.plus({ days: 1 }).set({ hour: 10 }), 'Cliente Sin Horario');
// Solo para la tabla de Clientes (próxima cita y Nº de citas): ninguna otra prueba lo toca.
await cita(barberoDos, corteDos, ahora.plus({ days: 20 }).startOf('day').set({ hour: 16 }), 'Cliente Tabla');
await conNegocio(negocio.negocioId, (tx) =>
  tx.consultar('INSERT INTO bloqueos (negocio_id, profesional_id, inicio, fin, motivo) VALUES ($1, $2, $3, $4, $5)', [
    negocio.negocioId,
    barberoE2E,
    diaDeVista.set({ hour: 13 }).toJSDate(),
    diaDeVista.set({ hour: 14 }).toJSDate(),
    'Almuerzo',
  ]),
);

// Por aprobar, en otro día para no cambiar la agenda de pasado mañana. La de Rechazar vence antes:
// va primero en la lista y se marca como urgente (menos de una hora).
const enTresDias = ahora.plus({ days: 3 }).startOf('day');
await cita(barberoE2E, corte, enTresDias.set({ hour: 10 }), 'Cliente Aprobar', { estado: 'por_aprobar', aprobacionExpiraEn: ahora.plus({ hours: 2 }) });
await cita(barberoDos, corteDos, enTresDias.set({ hour: 11 }), 'Cliente Rechazar', { estado: 'por_aprobar', aprobacionExpiraEn: ahora.plus({ minutes: 30 }) });

// Clientes sin citas, para editarlos y anonimizarlos.
async function clienteSinCitas(nombre: string | null, telefono = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')) {
  const id = randomUUID();
  await conNegocio(negocio.negocioId, (tx) =>
    tx.consultar('INSERT INTO clientes (id, negocio_id, nombre, telefono) VALUES ($1, $2, $3, $4)', [id, negocio.negocioId, nombre, telefono]),
  );
  return id;
}
const clienteEditable = await clienteSinCitas('Cliente Editable');
const clienteBorrable = await clienteSinCitas('Cliente Borrable');
// Sin nombre (llegó por WhatsApp sin decirlo): en la lista, su teléfono hace de nombre.
const telefonoSinNombre = '573' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
await clienteSinCitas(null, telefonoSinNombre);

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

// Plan con límites y uso del mes: 42 de 50 conversaciones (84%, en zona de aviso).
// Sin tope de barberos, para no frenar las pruebas que agregan uno.
await conSistema(async (tx) => {
  const { rows: planes } = await tx.consultar<{ id: string }>(
    `INSERT INTO planes (nombre, precio_mensual_cop, max_profesionales, max_citas_mes, max_conversaciones_ia_mes)
     VALUES ('Prueba E2E', 50000, NULL, 100, 50)
     ON CONFLICT (nombre) DO UPDATE SET max_citas_mes = 100, max_conversaciones_ia_mes = 50, max_profesionales = NULL
     RETURNING id`,
  );
  await tx.consultar('UPDATE negocios SET plan_id = $1 WHERE id = $2', [planes[0]!.id, negocio.negocioId]);
  await tx.consultar(
    `INSERT INTO uso_mensual (negocio_id, periodo, conversaciones_ia, citas_creadas, plantillas_enviadas) VALUES ($1, $2::date, 42, 12, 3)`,
    [negocio.negocioId, ahora.startOf('month').toISODate()],
  );
});

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
    vista: { fecha: diaDeVista.toISODate() },
    cuenta: cuentaPropia.email,
    clientes: { editable: clienteEditable, borrable: clienteBorrable, telefonoSinNombre },
    conversaciones,
  }),
);
