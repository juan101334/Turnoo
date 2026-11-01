import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatosInvalidos, NoEncontrado } from '../src/compartido/errores.js';
import { consultarDisponibilidad } from '../src/modulos/citas/citas.servicio.js';
import {
  crearBloqueo,
  crearCita,
  crearCliente,
  crearHorario,
  crearNegocio,
  crearProfesional,
  crearServicio,
  hora,
  limpiar,
  type NegocioDePrueba,
} from './ayudas.js';

/**
 * Pruebas de disponibilidad contra la base de datos real.
 * Lunes 2030-06-10; Bogotá es UTC-5, así que 09:00 local = 14:00 UTC.
 */

const LUNES = '2030-06-10';
const AHORA = new Date('2030-06-09T12:00:00Z'); // domingo, 7 a. m. en Bogotá

function cada(desde: string, hasta: string, paso = 15): string[] {
  const aMinutos = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const horas: string[] = [];
  for (let m = aMinutos(desde); m <= aMinutos(hasta); m += paso) {
    horas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return horas;
}

describe('consultarDisponibilidad', () => {
  let n: NegocioDePrueba;
  let clienteId: string;

  beforeAll(async () => {
    n = await crearNegocio();
    clienteId = await crearCliente(n);
  });
  afterAll(limpiar);

  /** Un barbero que trabaja los lunes de 8 a 12 y de 14 a 18, con corte (30 min) y barba (15 min). */
  async function nuevoBarbero() {
    const profesionalId = await crearProfesional(n);
    const corte = await crearServicio(n, profesionalId, 'Corte', 30, 20000);
    const barba = await crearServicio(n, profesionalId, 'Barba', 15, 10000);
    await crearHorario(n, profesionalId, 1, '08:00', '12:00');
    await crearHorario(n, profesionalId, 1, '14:00', '18:00');
    return { profesionalId, corte, barba };
  }

  const horasDelLunes = async (
    profesionalId: string,
    servicioIds: string[],
    ahora = AHORA,
    negocioId = n.negocioId,
  ) => {
    const r = await consultarDisponibilidad(negocioId, { profesionalId, servicioIds, desde: LUNES, hasta: LUNES }, ahora);
    return r.dias.flatMap((d) => d.huecos.map((h) => h.hora));
  };

  it('suma la duración y el precio de varios servicios', async () => {
    const { profesionalId, corte, barba } = await nuevoBarbero();
    const r = await consultarDisponibilidad(n.negocioId, {
      profesionalId,
      servicioIds: [corte, barba],
      desde: LUNES,
      hasta: LUNES,
    }, AHORA);
    expect(r.duracionTotalMinutos).toBe(45);
    expect(r.precioTotalCop).toBe(30000);
    expect(r.zonaHoraria).toBe('America/Bogota');
    expect(r.servicios.map((s) => s.nombre).sort()).toEqual(['Barba', 'Corte']);
  });

  it('calcula los horarios con la duración total, sin cruzar el almuerzo', async () => {
    const { profesionalId, corte, barba } = await nuevoBarbero();
    expect(await horasDelLunes(profesionalId, [corte, barba])).toEqual([
      ...cada('08:00', '11:15'),
      ...cada('14:00', '17:15'),
    ]);
  });

  it('descuenta una cita existente', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    await crearCita(n, { profesionalId, clienteId, inicio: hora('14:00'), fin: hora('14:45') }); // 09:00-09:45 local
    expect(await horasDelLunes(profesionalId, [corte])).toEqual([
      ...cada('08:00', '08:30'),
      ...cada('09:45', '11:30'),
      ...cada('14:00', '17:30'),
    ]);
  });

  it('una cita cancelada no ocupa el hueco, pero una por aprobar sí', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    await crearCita(n, { profesionalId, clienteId, inicio: hora('13:00'), fin: hora('13:30'), estado: 'cancelada' }); // 08:00 local
    await crearCita(n, { profesionalId, clienteId, inicio: hora('15:00'), fin: hora('15:30'), estado: 'por_aprobar' }); // 10:00 local
    const horas = await horasDelLunes(profesionalId, [corte]);
    expect(horas).toContain('08:00');
    expect(horas).not.toContain('10:00');
    expect(horas).not.toContain('09:45'); // 09:45-10:15 chocaría con la cita de las 10:00
  });

  it('un bloqueo de todo el negocio afecta a todos los barberos', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    await crearBloqueo(n, null, hora('19:00'), hora('21:00')); // 14:00-16:00 local
    const horas = await horasDelLunes(profesionalId, [corte]);
    expect(horas.filter((h) => h >= '14:00' && h < '16:00')).toEqual([]);
    expect(horas).toContain('16:00');
  });

  it('un bloqueo de otro barbero no afecta a este', async () => {
    const a = await nuevoBarbero();
    const b = await nuevoBarbero();
    await crearBloqueo(n, b.profesionalId, hora('13:00'), hora('17:00')); // 08:00-12:00 local, solo de B
    expect(await horasDelLunes(a.profesionalId, [a.corte])).toContain('08:00');
    expect(await horasDelLunes(b.profesionalId, [b.corte])).not.toContain('08:00');
  });

  it('respeta la anticipación mínima del negocio (1 hora)', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    const ahora = hora('13:00'); // 08:00 local
    expect((await horasDelLunes(profesionalId, [corte], ahora))[0]).toBe('09:00');
  });

  it('en una semana solo devuelve los días que tienen horarios', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    const r = await consultarDisponibilidad(n.negocioId, {
      profesionalId,
      servicioIds: [corte],
      desde: LUNES,
      hasta: '2030-06-16',
    }, AHORA);
    expect(r.dias.map((d) => d.fecha)).toEqual([LUNES]);
  });

  it('rechaza servicios que no son de ese barbero', async () => {
    const a = await nuevoBarbero();
    const b = await nuevoBarbero();
    await expect(
      consultarDisponibilidad(n.negocioId, { profesionalId: a.profesionalId, servicioIds: [b.corte], desde: LUNES, hasta: LUNES }, AHORA),
    ).rejects.toBeInstanceOf(DatosInvalidos);
  });

  it('rechaza un barbero que no existe', async () => {
    const { corte } = await nuevoBarbero();
    await expect(
      consultarDisponibilidad(n.negocioId, { profesionalId: randomUUID(), servicioIds: [corte], desde: LUNES, hasta: LUNES }, AHORA),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });

  it('valida las fechas y los servicios de la consulta', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    const base = { profesionalId, servicioIds: [corte], desde: LUNES, hasta: LUNES };
    const casos = [
      { ...base, desde: '10/06/2030' },
      { ...base, desde: '2030-02-31' },
      { ...base, hasta: '2030-06-09' },
      { ...base, hasta: '2030-08-30' },
      { ...base, servicioIds: [] },
      { ...base, servicioIds: [corte, corte] },
      { ...base, servicioIds: ['no-es-uuid'] },
      { ...base, profesionalId: 'no-es-uuid' },
    ];
    for (const caso of casos) {
      await expect(consultarDisponibilidad(n.negocioId, caso, AHORA)).rejects.toBeInstanceOf(DatosInvalidos);
    }
  });

  it('otro negocio no puede consultar la agenda de este barbero', async () => {
    const { profesionalId, corte } = await nuevoBarbero();
    const otro = await crearNegocio('Otro negocio');
    await expect(
      consultarDisponibilidad(otro.negocioId, { profesionalId, servicioIds: [corte], desde: LUNES, hasta: LUNES }, AHORA),
    ).rejects.toBeInstanceOf(NoEncontrado);
  });
});
