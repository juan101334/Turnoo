import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HorarioNoDisponible, TransicionNoPermitida } from '../src/compartido/errores.js';
import { conNegocio } from '../src/db/contexto.js';
import {
  cambiarEstado,
  crearCita,
  crearCliente,
  crearNegocio,
  crearProfesional,
  crearServicio,
  hora,
  limpiar,
  type EstadoCita,
  type NegocioDePrueba,
} from './ayudas.js';

describe('citas: agenda sin dobles reservas', () => {
  let n: NegocioDePrueba;
  let clienteId: string;

  beforeAll(async () => {
    n = await crearNegocio();
    clienteId = await crearCliente(n);
  });
  afterAll(limpiar);

  it('rechaza una cita que se solapa con otra del mismo barbero', async () => {
    const barbero = await crearProfesional(n);
    await crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:00'), fin: hora('15:45') });
    await expect(
      crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:30'), fin: hora('16:00') }),
    ).rejects.toBeInstanceOf(HorarioNoDisponible);
  });

  it('permite citas seguidas: una termina cuando empieza la otra', async () => {
    const barbero = await crearProfesional(n);
    await crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:00'), fin: hora('15:45') });
    await expect(
      crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:45'), fin: hora('16:15') }),
    ).resolves.toBeTypeOf('string');
  });

  it('permite la misma hora con otro barbero', async () => {
    const barbero1 = await crearProfesional(n);
    const barbero2 = await crearProfesional(n);
    await crearCita(n, { profesionalId: barbero1, clienteId, inicio: hora('15:00'), fin: hora('15:45') });
    await expect(
      crearCita(n, { profesionalId: barbero2, clienteId, inicio: hora('15:00'), fin: hora('15:45') }),
    ).resolves.toBeTypeOf('string');
  });

  it('una cita cancelada libera el hueco', async () => {
    const barbero = await crearProfesional(n);
    const cita = await crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:00'), fin: hora('15:45') });
    await cambiarEstado(n, cita, 'cancelada');
    await expect(
      crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:15'), fin: hora('15:45') }),
    ).resolves.toBeTypeOf('string');
  });

  it('una cita por aprobar también reserva el hueco', async () => {
    const barbero = await crearProfesional(n);
    await crearCita(n, {
      profesionalId: barbero,
      clienteId,
      inicio: hora('16:00'),
      fin: hora('16:30'),
      estado: 'por_aprobar',
    });
    await expect(
      crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('16:15'), fin: hora('16:45') }),
    ).rejects.toBeInstanceOf(HorarioNoDisponible);
  });

  it('rechaza una cita que termina antes de empezar', async () => {
    const barbero = await crearProfesional(n);
    await expect(
      crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('15:30'), fin: hora('15:00') }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('una cita por aprobar necesita un plazo de aprobación', async () => {
    const barbero = await crearProfesional(n);
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 'por_aprobar')`,
          [n.negocioId, n.sedeId, barbero, clienteId, hora('17:00'), hora('17:30')],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('citas: estados', () => {
  let n: NegocioDePrueba;
  let clienteId: string;

  beforeAll(async () => {
    n = await crearNegocio();
    clienteId = await crearCliente(n);
  });
  afterAll(limpiar);

  async function citaEn(estado: EstadoCita): Promise<string> {
    const barbero = await crearProfesional(n);
    return crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('10:00'), fin: hora('10:30'), estado });
  }

  const permitidas: [EstadoCita, EstadoCita][] = [
    ['por_aprobar', 'pendiente'],
    ['por_aprobar', 'cancelada'],
    ['pendiente', 'confirmada'],
    ['pendiente', 'cancelada'],
    ['pendiente', 'completada'],
    ['pendiente', 'no_asistio'],
    ['confirmada', 'completada'],
    ['completada', 'no_asistio'],
    ['no_asistio', 'completada'],
  ];

  const prohibidas: [EstadoCita, EstadoCita][] = [
    ['por_aprobar', 'completada'],
    ['por_aprobar', 'no_asistio'],
    ['pendiente', 'por_aprobar'],
    ['completada', 'cancelada'],
    ['completada', 'pendiente'],
    ['no_asistio', 'cancelada'],
    ['cancelada', 'pendiente'],
    ['cancelada', 'completada'],
  ];

  it.each(permitidas)('permite pasar de %s a %s', async (desde, hasta) => {
    const cita = await citaEn(desde);
    await expect(cambiarEstado(n, cita, hasta)).resolves.toBeDefined();
  });

  it.each(prohibidas)('no permite pasar de %s a %s', async (desde, hasta) => {
    const cita = await citaEn(desde);
    await expect(cambiarEstado(n, cita, hasta)).rejects.toBeInstanceOf(TransicionNoPermitida);
  });
});

describe('citas: servicios', () => {
  let n: NegocioDePrueba;
  let clienteId: string;

  beforeAll(async () => {
    n = await crearNegocio();
    clienteId = await crearCliente(n);
  });
  afterAll(limpiar);

  const agregarServicio = (citaId: string, servicioId: string, profesionalId: string) =>
    conNegocio(n.negocioId, (tx) =>
      tx.consultar(
        `INSERT INTO cita_servicios (cita_id, servicio_id, negocio_id, profesional_id, nombre, duracion_minutos, precio_cop)
         VALUES ($1, $2, $3, $4, 'Servicio', 30, 20000)`,
        [citaId, servicioId, n.negocioId, profesionalId],
      ),
    );

  it('una cita admite varios servicios del mismo barbero', async () => {
    const barbero = await crearProfesional(n);
    const corte = await crearServicio(n, barbero, 'Corte', 30, 20000);
    const barba = await crearServicio(n, barbero, 'Barba', 15, 10000);
    const cita = await crearCita(n, { profesionalId: barbero, clienteId, inicio: hora('09:00'), fin: hora('09:45') });
    await agregarServicio(cita, corte, barbero);
    await expect(agregarServicio(cita, barba, barbero)).resolves.toBeDefined();
  });

  it('no admite un servicio de otro barbero', async () => {
    const barbero1 = await crearProfesional(n);
    const barbero2 = await crearProfesional(n);
    const servicioDelOtro = await crearServicio(n, barbero2);
    const cita = await crearCita(n, { profesionalId: barbero1, clienteId, inicio: hora('09:00'), fin: hora('09:30') });
    await expect(agregarServicio(cita, servicioDelOtro, barbero1)).rejects.toMatchObject({ code: '23503' });
  });

  it('un barbero no puede repetir el nombre de un servicio activo', async () => {
    const barbero = await crearProfesional(n);
    await crearServicio(n, barbero, 'Corte');
    await expect(crearServicio(n, barbero, 'corte')).rejects.toMatchObject({ name: 'Duplicado' });
  });
});
