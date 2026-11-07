import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { alHorarioPermitido, dentroDeHorarioLocal, horaEnPalabras } from '../src/compartido/tiempo.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { reprogramar } from '../src/modulos/citas/citas.repositorio.js';
import { datosDelRecordatorio, reservar } from '../src/modulos/recordatorios/recordatorios.repositorio.js';
import {
  decidir,
  enviarRecordatorios,
  MAX_INTENTOS_RECORDATORIO,
  PLANTILLA_RECORDATORIO,
  plantillaDeRecordatorio,
} from '../src/modulos/recordatorios/recordatorios.servicio.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearCita, crearNegocio, crearProfesional, crearServicio, limpiar, type EstadoCita, type NegocioDePrueba } from './ayudas.js';

const ZONA = 'America/Bogota';
const MIN = 60_000;
const HORA = 60 * MIN;
/** Hora local de Bogotá (UTC-5) como instante. */
const bogota = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-05:00`);

/** Cita del sábado 17 de marzo de 2035 a las 10:00: el ideal (11 h antes) cae a las 23:00 del viernes. */
const CITA = bogota('2035-03-17', '10:00');
const MOMENTO = bogota('2035-03-16', '21:00');
const TOKEN = 'EAAtoken-de-prueba-recordatorios';

function metaFalso(estado = 200, codigo?: number) {
  const enviados: { url: string; cuerpo: Record<string, any> }[] = [];
  const pedir = vi.fn<typeof fetch>(async (url, init) => {
    enviados.push({ url: String(url), cuerpo: JSON.parse(String(init!.body)) });
    if (estado !== 200) return new Response(JSON.stringify({ error: { code: codigo ?? 1 } }), { status: estado });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 });
  });
  return { pedir, enviados };
}

describe('horario permitido (tiempo.ts)', () => {
  const lejos = bogota('2035-12-31', '00:00');

  it('dentro del horario no se mueve', () => {
    expect(alHorarioPermitido(bogota('2035-03-16', '15:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '15:00'));
    expect(alHorarioPermitido(bogota('2035-03-16', '07:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '07:00'));
    expect(alHorarioPermitido(bogota('2035-03-16', '21:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '21:00'));
  });

  it('de noche va al borde más cercano', () => {
    expect(alHorarioPermitido(bogota('2035-03-16', '23:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '21:00'));
    expect(alHorarioPermitido(bogota('2035-03-17', '05:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-17', '07:00'));
    expect(alHorarioPermitido(bogota('2035-03-17', '01:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '21:00'));
    expect(alHorarioPermitido(bogota('2035-03-16', '21:30'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '21:00'));
  });

  it('en empate elige el cierre anterior', () => {
    expect(alHorarioPermitido(bogota('2035-03-17', '02:00'), '07:00', '21:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '21:00'));
  });

  it('la apertura siguiente solo vale antes del límite', () => {
    const ideal = bogota('2035-03-17', '06:00');
    expect(alHorarioPermitido(ideal, '07:00', '21:00', ZONA, bogota('2035-03-17', '07:01'))).toEqual(bogota('2035-03-17', '07:00'));
    expect(alHorarioPermitido(ideal, '07:00', '21:00', ZONA, bogota('2035-03-17', '07:00'))).toEqual(bogota('2035-03-16', '21:00'));
  });

  it('respeta el horario que configure el negocio', () => {
    expect(alHorarioPermitido(bogota('2035-03-16', '19:00'), '09:00', '18:00', ZONA, lejos)).toEqual(bogota('2035-03-16', '18:00'));
    expect(alHorarioPermitido(bogota('2035-03-17', '08:00'), '09:00', '18:00', ZONA, lejos)).toEqual(bogota('2035-03-17', '09:00'));
  });

  it('dentroDeHorarioLocal incluye los bordes', () => {
    expect(dentroDeHorarioLocal(bogota('2035-03-16', '07:00'), '07:00', '21:00', ZONA)).toBe(true);
    expect(dentroDeHorarioLocal(bogota('2035-03-16', '21:00'), '07:00', '21:00', ZONA)).toBe(true);
    expect(dentroDeHorarioLocal(new Date(bogota('2035-03-16', '21:00').getTime() + 1000), '07:00', '21:00', ZONA)).toBe(false);
    expect(dentroDeHorarioLocal(bogota('2035-03-16', '06:59'), '07:00', '21:00', ZONA)).toBe(false);
  });

  it('horaEnPalabras usa 12 horas', () => {
    expect(horaEnPalabras(bogota('2035-03-16', '00:05'), ZONA)).toBe('12:05 a. m.');
    expect(horaEnPalabras(bogota('2035-03-16', '09:00'), ZONA)).toBe('9:00 a. m.');
    expect(horaEnPalabras(bogota('2035-03-16', '12:00'), ZONA)).toBe('12:00 p. m.');
    expect(horaEnPalabras(bogota('2035-03-16', '15:30'), ZONA)).toBe('3:30 p. m.');
  });
});

describe('decidir', () => {
  const candidata = (inicio: Date, programadaEn = bogota('2035-03-01', '12:00'), horas = 11) => ({
    id: 'x',
    negocioId: 'y',
    inicio,
    programadaEn,
    horasRecordatorio: horas,
    noAntesDe: '07:00',
    noDespuesDe: '21:00',
    zonaHoraria: ZONA,
  });

  it('cita a las 10:00: sale a las 21:00 de la noche anterior', () => {
    const c = candidata(CITA);
    expect(decidir(c, new Date(MOMENTO.getTime() - MIN))).toBe('esperar');
    expect(decidir(c, MOMENTO)).toBe('enviar');
    expect(decidir(c, new Date(MOMENTO.getTime() + 4 * MIN))).toBe('enviar');
    // Pasada la tolerancia ya es de noche: espera a las 07:00.
    expect(decidir(c, new Date(MOMENTO.getTime() + 30 * MIN))).toBe('esperar');
    expect(decidir(c, bogota('2035-03-17', '07:00'))).toBe('enviar');
  });

  it('cita a las 16:00: sale a las 07:00 del mismo día', () => {
    const c = candidata(bogota('2035-03-17', '16:00'));
    expect(decidir(c, bogota('2035-03-16', '21:00'))).toBe('esperar');
    expect(decidir(c, bogota('2035-03-17', '06:59'))).toBe('esperar');
    expect(decidir(c, bogota('2035-03-17', '07:00'))).toBe('enviar');
  });

  it('cita a las 20:00: el ideal (09:00) ya está en horario', () => {
    const c = candidata(bogota('2035-03-17', '20:00'));
    expect(decidir(c, bogota('2035-03-17', '08:59'))).toBe('esperar');
    expect(decidir(c, bogota('2035-03-17', '09:00'))).toBe('enviar');
  });

  it('agendada o reprogramada después del momento ideal: no se envía', () => {
    expect(decidir(candidata(CITA, bogota('2035-03-16', '23:01')), bogota('2035-03-17', '07:00'))).toBe('agendada_tarde');
    expect(decidir(candidata(CITA, bogota('2035-03-16', '23:00')), bogota('2035-03-17', '07:00'))).toBe('enviar');
  });

  it('a menos de 30 minutos de la cita ya no envía', () => {
    const c = candidata(bogota('2035-03-17', '10:00'), bogota('2035-03-01', '12:00'), 1);
    expect(decidir(c, bogota('2035-03-17', '09:00'))).toBe('enviar');
    expect(decidir(c, bogota('2035-03-17', '09:30'))).toBe('esperar');
  });
});

describe('texto de la plantilla', () => {
  it('lleva cliente, negocio, fecha, hora, barbero y servicios', () => {
    const p = plantillaDeRecordatorio({
      inicio: CITA,
      zonaHoraria: ZONA,
      negocioNombre: 'Barbería La 70',
      profesionalNombre: 'Carlos',
      servicios: ['Corte', 'Barba', 'Cejas'],
      clienteNombre: 'Laura\nPérez',
    });
    expect(p).toEqual({
      nombre: PLANTILLA_RECORDATORIO,
      idioma: 'es_CO',
      parametros: {
        cliente: 'Laura Pérez',
        negocio: 'Barbería La 70',
        fecha: 'sábado 17 de marzo',
        hora: '10:00 a. m.',
        profesional: 'Carlos',
        servicios: 'Corte, Barba y Cejas',
      },
    });
  });

  it('sin nombre ni servicios, igual se entiende', () => {
    const p = plantillaDeRecordatorio({ inicio: CITA, zonaHoraria: ZONA, negocioNombre: 'X', profesionalNombre: 'Y', servicios: [], clienteNombre: null });
    expect(p.parametros).toMatchObject({ cliente: 'cliente', servicios: 'tu servicio' });
    expect(plantillaDeRecordatorio({ inicio: CITA, zonaHoraria: ZONA, negocioNombre: 'X', profesionalNombre: 'Y', servicios: ['Corte'], clienteNombre: null }).parametros.servicios).toBe('Corte');
  });
});

describe('enviarRecordatorios', () => {
  let telefonos = 0;

  interface Escena {
    n: NegocioDePrueba;
    profesionalId: string;
    cuentaId: string;
    phoneNumberId: string;
  }

  async function escena(): Promise<Escena> {
    const n = await crearNegocio('Barbería La 70');
    const profesionalId = await crearProfesional(n, 'Carlos');
    const phoneNumberId = `${Date.now()}${++telefonos}`;
    const cuenta = await registrarCuenta(n.negocioId, { phoneNumberId, wabaId: '1', numeroVisible: '3000000003', token: TOKEN });
    return { n, profesionalId, cuentaId: cuenta.id, phoneNumberId };
  }

  const sql = async <F extends object>(e: Escena, texto: string, params: unknown[] = []) =>
    (await conNegocio(e.n.negocioId, (tx) => tx.consultar<F>(texto, params))).rows;

  async function cliente(e: Escena, opciones: { consintio?: boolean; telefono?: boolean } = {}) {
    const telefono = opciones.telefono === false ? null : `5731${String(++telefonos).padStart(8, '0')}`;
    const [c] = await sql<{ id: string }>(e, 'INSERT INTO clientes (negocio_id, nombre, telefono, wa_user_id) VALUES ($1, $2, $3, $4) RETURNING id', [
      e.n.negocioId,
      'Laura',
      telefono,
      telefono ? null : `CO.${randomUUID().replaceAll('-', '')}`,
    ]);
    if (opciones.consintio !== false) {
      await sql(e, `INSERT INTO consentimientos (negocio_id, cliente_id, version_politica) VALUES ($1, $2, '2026-11-v1')`, [e.n.negocioId, c!.id]);
    }
    return { id: c!.id, telefono };
  }

  async function cita(e: Escena, clienteId: string, inicio = CITA, estado: EstadoCita = 'pendiente') {
    return crearCita(e.n, { profesionalId: e.profesionalId, clienteId, inicio, fin: new Date(inicio.getTime() + 30 * MIN), estado });
  }

  const recordatorio = async (e: Escena, citaId: string) =>
    (await sql<{ recordatorio_resultado: string | null; recordatorio_intentos: number; recordatorio_enviado_en: Date | null }>(
      e,
      'SELECT recordatorio_resultado, recordatorio_intentos, recordatorio_enviado_en FROM citas WHERE id = $1',
      [citaId],
    ))[0]!;

  /** Solo los envíos de esta escena: la tarea recorre todos los negocios. */
  const deEscena = (e: Escena, meta: ReturnType<typeof metaFalso>) => meta.enviados.filter((m) => m.url.includes(e.phoneNumberId));

  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await limpiar();
  });

  it('envía al cliente en el momento, por la cuenta del negocio, una sola vez', async () => {
    const e = await escena();
    const c = await cliente(e);
    const citaId = await cita(e, c.id);
    const servicioId = await crearServicio(e.n, e.profesionalId, 'Corte');
    await sql(
      e,
      `INSERT INTO cita_servicios (cita_id, servicio_id, negocio_id, profesional_id, nombre, duracion_minutos, precio_cop) VALUES ($1, $2, $3, $4, 'Corte clásico', 30, 20000)`,
      [citaId, servicioId, e.n.negocioId, e.profesionalId],
    );

    const antes = metaFalso();
    await enviarRecordatorios(new Date(MOMENTO.getTime() - MIN), { pedir: antes.pedir });
    expect(deEscena(e, antes)).toHaveLength(0);

    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    const propios = deEscena(e, meta);
    expect(propios).toHaveLength(1);
    expect(propios[0]!.cuerpo).toMatchObject({ to: c.telefono, type: 'template', template: { name: PLANTILLA_RECORDATORIO, language: { code: 'es_CO' } } });
    const parametros = Object.fromEntries(
      (propios[0]!.cuerpo.template.components[0].parameters as { parameter_name: string; text: string }[]).map((p) => [p.parameter_name, p.text]),
    );
    expect(parametros).toEqual({
      cliente: 'Laura',
      negocio: 'Barbería La 70',
      fecha: 'sábado 17 de marzo',
      hora: '10:00 a. m.',
      profesional: 'Carlos',
      servicios: 'Corte clásico',
    });
    expect(await recordatorio(e, citaId)).toMatchObject({ recordatorio_resultado: 'enviado', recordatorio_enviado_en: MOMENTO });
    expect((await sql<{ p: number }>(e, `SELECT plantillas_enviadas AS p FROM uso_mensual WHERE periodo = '2035-03-01'`))[0]!.p).toBe(1);

    const otra = metaFalso();
    await enviarRecordatorios(new Date(MOMENTO.getTime() + MIN), { pedir: otra.pedir });
    expect(deEscena(e, otra)).toHaveLength(0);
  });

  it('dos vueltas a la vez envían una sola vez', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    const meta = metaFalso();
    await Promise.all([enviarRecordatorios(MOMENTO, { pedir: meta.pedir }), enviarRecordatorios(MOMENTO, { pedir: meta.pedir })]);
    expect(deEscena(e, meta)).toHaveLength(1);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('enviado');
  });

  it('sin consentimiento o sin teléfono no envía y lo anota', async () => {
    const e = await escena();
    const sinConsentimiento = await cita(e, (await cliente(e, { consintio: false })).id);
    const sinTelefono = await cita(e, (await cliente(e, { telefono: false })).id, bogota('2035-03-17', '10:30'));
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(0);
    expect((await recordatorio(e, sinConsentimiento)).recordatorio_resultado).toBe('sin_consentimiento');
    expect((await recordatorio(e, sinTelefono)).recordatorio_resultado).toBe('sin_telefono');
  });

  it('agendada después del momento ideal: no envía y lo anota', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    await sql(e, 'UPDATE citas SET programada_en = $2 WHERE id = $1', [citaId, bogota('2035-03-16', '23:30')]);
    const meta = metaFalso();
    await enviarRecordatorios(bogota('2035-03-17', '07:00'), { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(0);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('agendada_tarde');
  });

  it('a menos de 30 minutos de la cita queda vencido', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    const meta = metaFalso();
    await enviarRecordatorios(new Date(CITA.getTime() - 29 * MIN), { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(0);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('vencido');
  });

  it.each<EstadoCita>(['por_aprobar', 'cancelada', 'completada', 'no_asistio'])('una cita %s no recibe recordatorio', async (estado) => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id, CITA, estado);
    // Agendada tarde: si la tarea la tomara, la anotaría como agendada_tarde.
    await sql(e, 'UPDATE citas SET programada_en = $2 WHERE id = $1', [citaId, bogota('2035-03-16', '23:30')]);
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    await enviarRecordatorios(new Date(CITA.getTime() - MIN), { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(0);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBeNull();
  });

  it('una cita reservada no se vuelve a reservar mientras dure la reserva', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    const primera = await conSistema((tx) => reservar(tx, [citaId], MOMENTO, 2 * MIN));
    expect(primera.map((r) => r.id)).toEqual([citaId]);
    expect(await conSistema((tx) => reservar(tx, [citaId], new Date(MOMENTO.getTime() + MIN), 2 * MIN))).toEqual([]);
    expect(await conSistema((tx) => reservar(tx, [citaId], new Date(MOMENTO.getTime() + 2 * MIN), 2 * MIN))).toHaveLength(1);
  });

  it('los datos solo salen si la cita sigue activa y pendiente de recordatorio', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    const leer = () => conNegocio(e.n.negocioId, (tx) => datosDelRecordatorio(tx, citaId));
    expect(await leer()).not.toBeNull();
    await sql(e, `UPDATE citas SET estado = 'cancelada', cancelada_en = now(), cancelada_por = 'cliente' WHERE id = $1`, [citaId]);
    expect(await leer()).toBeNull();
    const otra = await cita(e, (await cliente(e)).id, bogota('2035-03-17', '11:00'));
    await sql(e, `UPDATE citas SET recordatorio_resultado = 'vencido' WHERE id = $1`, [otra]);
    expect(await conNegocio(e.n.negocioId, (tx) => datosDelRecordatorio(tx, otra))).toBeNull();
  });

  it('una cita confirmada sí lo recibe', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id, CITA, 'confirmada');
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(1);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('enviado');
  });

  it('un negocio suspendido no envía', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    await conSistema((tx) => tx.consultar(`UPDATE negocios SET estado = 'suspendido' WHERE id = $1`, [e.n.negocioId]));
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(0);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBeNull();
  });

  it('un fallo pasajero se reintenta y a los 3 intentos queda fallido', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    const meta = metaFalso(503);
    for (let i = 1; i <= MAX_INTENTOS_RECORDATORIO; i++) {
      await enviarRecordatorios(new Date(MOMENTO.getTime() + (i - 1) * MIN), { pedir: meta.pedir });
      expect(await recordatorio(e, citaId)).toMatchObject({
        recordatorio_intentos: i,
        recordatorio_resultado: i < MAX_INTENTOS_RECORDATORIO ? null : 'fallido',
      });
    }
    expect(deEscena(e, meta)).toHaveLength(MAX_INTENTOS_RECORDATORIO);
  });

  it('un fallo definitivo (plantilla no aprobada) queda fallido de una vez', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    await enviarRecordatorios(MOMENTO, { pedir: metaFalso(404, 132001).pedir });
    expect(await recordatorio(e, citaId)).toMatchObject({ recordatorio_resultado: 'fallido', recordatorio_intentos: 1 });
  });

  it('sin cuenta de WhatsApp activa queda fallido', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    await sql(e, 'UPDATE whatsapp_cuentas SET activa = false WHERE id = $1', [e.cuentaId]);
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    expect(meta.enviados.filter((m) => m.url.includes(e.phoneNumberId))).toHaveLength(0);
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('fallido');
  });

  it('usa la cuenta por la que escribió el cliente', async () => {
    const e = await escena();
    const segundo = `${Date.now()}${++telefonos}`;
    const otraCuenta = await registrarCuenta(e.n.negocioId, { phoneNumberId: segundo, wabaId: '1', numeroVisible: '3000000004', token: TOKEN });
    const c = await cliente(e);
    await sql(e, 'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4)', [
      e.n.negocioId,
      c.id,
      otraCuenta.id,
      bogota('2035-03-10', '12:00'),
    ]);
    await cita(e, c.id);
    const meta = metaFalso();
    await enviarRecordatorios(MOMENTO, { pedir: meta.pedir });
    expect(meta.enviados.filter((m) => m.url.includes(`/${segundo}/`))).toHaveLength(1);
    expect(deEscena(e, meta).filter((m) => !m.url.includes(`/${segundo}/`))).toHaveLength(0);
  });

  it('reprogramar reinicia el recordatorio', async () => {
    const e = await escena();
    const citaId = await cita(e, (await cliente(e)).id);
    await enviarRecordatorios(MOMENTO, { pedir: metaFalso().pedir });
    expect((await recordatorio(e, citaId)).recordatorio_resultado).toBe('enviado');

    const nueva = bogota('2035-03-24', '10:00');
    const ahora = bogota('2035-03-17', '09:00');
    await conNegocio(e.n.negocioId, (tx) => reprogramar(tx, citaId, nueva, new Date(nueva.getTime() + 30 * MIN), ahora));
    expect(await recordatorio(e, citaId)).toEqual({ recordatorio_resultado: null, recordatorio_intentos: 0, recordatorio_enviado_en: null });
    expect((await sql<{ programada_en: Date }>(e, 'SELECT programada_en FROM citas WHERE id = $1', [citaId]))[0]!.programada_en).toEqual(ahora);

    const meta = metaFalso();
    await enviarRecordatorios(bogota('2035-03-23', '21:00'), { pedir: meta.pedir });
    expect(deEscena(e, meta)).toHaveLength(1);
  });
});
