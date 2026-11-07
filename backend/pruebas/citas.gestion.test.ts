import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DatosInvalidos,
  FueraDePlazo,
  HorarioNoDisponible,
  LimiteDeCitas,
  LimiteDelPlan,
  NoEncontrado,
  Prohibido,
  TransicionNoPermitida,
} from '../src/compartido/errores.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import {
  aprobarCita,
  cancelarCita,
  crearCita,
  marcarCita,
  rechazarCita,
  reprogramarCita,
} from '../src/modulos/citas/citas.servicio.js';
import {
  crearCita as insertarCita,
  crearCliente,
  crearHorario,
  crearNegocio,
  crearProfesional,
  crearServicio,
  hora,
  limpiar,
  type EstadoCita,
  type NegocioDePrueba,
} from './ayudas.js';

/**
 * Lunes 2030-06-10, Bogotá = UTC-5. Cada prueba usa su propio barbero (8-12 y 14-18 local,
 * o sea 13-17 y 19-23 UTC) para no chocar con las demás. 09:00 local = 14:00 UTC.
 */
const AHORA = new Date('2030-06-09T12:00:00Z'); // domingo 07:00 local
const planesCreados: string[] = [];

async function barbero(n: NegocioDePrueba) {
  const profesionalId = await crearProfesional(n);
  const corte = await crearServicio(n, profesionalId, 'Corte', 30, 20000);
  const barba = await crearServicio(n, profesionalId, 'Barba', 15, 10000);
  await crearHorario(n, profesionalId, 1, '08:00', '12:00');
  await crearHorario(n, profesionalId, 1, '14:00', '18:00');
  return { profesionalId, corte, barba };
}

describe('gestión de citas', () => {
  let n: NegocioDePrueba;

  beforeAll(async () => {
    n = await crearNegocio();
  });
  afterAll(async () => {
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM planes WHERE id = ANY($1::uuid[])', [planesCreados]));
  });

  /** Un barbero nuevo y atajos para agendar y leer con él. */
  async function escenario() {
    const b = await barbero(n);
    const agendar = (clienteId: string, hhmm: string, servicioIds = [b.corte], ahora = AHORA) =>
      crearCita(n.negocioId, { profesionalId: b.profesionalId, clienteId, servicioIds, inicio: hora(hhmm) }, ahora);
    const directa = (clienteId: string, dia: string, estado: EstadoCita) =>
      insertarCita(n, { profesionalId: b.profesionalId, clienteId, inicio: hora('13:00', dia), fin: hora('13:30', dia), estado });
    return { ...b, agendar, directa };
  }

  const leer = <T extends object>(sql: string, params: unknown[] = []) =>
    conNegocio(n.negocioId, async (tx) => (await tx.consultar<T>(sql, params)).rows);

  const conInasistencias = async (e: Awaited<ReturnType<typeof escenario>>, cuantas: number) => {
    const clienteId = await crearCliente(n);
    for (const dia of ['2030-05-20', '2030-05-25', '2030-06-01'].slice(0, cuantas)) {
      await e.directa(clienteId, dia, 'no_asistio');
    }
    return clienteId;
  };

  describe('crearCita', () => {
    it('crea la cita pendiente y copia nombre, duración y precio de los servicios', async () => {
      const e = await escenario();
      const cita = await e.agendar(await crearCliente(n), '14:00', [e.corte, e.barba]);
      expect(cita.estado).toBe('pendiente');
      expect(cita.fin).toEqual(hora('14:45'));
      expect(cita.precioTotalCop).toBe(30000);
      expect(cita.aprobacionExpiraEn).toBeNull();
      expect(cita.servicios.map((s) => s.nombre)).toEqual(['Corte', 'Barba']);
      // Cuándo se agendó decide si el recordatorio llega a tiempo.
      expect(await leer('SELECT programada_en AS p, recordatorio_resultado AS r FROM citas WHERE id = $1', [cita.id])).toEqual([{ p: AHORA, r: null }]);

      await conNegocio(n.negocioId, (tx) => tx.consultar('UPDATE servicios SET precio_cop = 99999 WHERE id = $1', [e.corte]));
      expect(
        await leer('SELECT nombre, duracion_minutos, precio_cop, orden FROM cita_servicios WHERE cita_id = $1 ORDER BY orden', [cita.id]),
      ).toEqual([
        { nombre: 'Corte', duracion_minutos: 30, precio_cop: 20000, orden: 1 },
        { nombre: 'Barba', duracion_minutos: 15, precio_cop: 10000, orden: 2 },
      ]);
    });

    it('suma una cita al uso del mes', async () => {
      const e = await escenario();
      const contar = async () => (await leer<{ c: number }>("SELECT coalesce(max(citas_creadas), 0)::int AS c FROM uso_mensual WHERE periodo = '2030-06-01'"))[0]!.c;
      const antes = await contar();
      await e.agendar(await crearCliente(n), '15:00');
      expect(await contar()).toBe(antes + 1);
    });

    it('rechaza horas que no son un hueco: antes de abrir, almuerzo, sin alinear, sin anticipación', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      for (const [hhmm, ahora] of [['12:00', AHORA], ['18:00', AHORA], ['13:10', AHORA], ['14:00', hora('13:30')]] as const) {
        await expect(e.agendar(clienteId, hhmm, [e.corte], ahora)).rejects.toBeInstanceOf(HorarioNoDisponible);
      }
    });

    it('no deja ocupar un hueco tomado, ni siquiera parcialmente', async () => {
      const e = await escenario();
      await e.agendar(await crearCliente(n), '16:00');
      await expect(e.agendar(await crearCliente(n), '16:00')).rejects.toBeInstanceOf(HorarioNoDisponible);
      await expect(e.agendar(await crearCliente(n), '16:15')).rejects.toBeInstanceOf(HorarioNoDisponible);
      await e.agendar(await crearCliente(n), '16:30');
    });

    it('si dos clientes piden el mismo hueco a la vez, solo uno lo obtiene', async () => {
      const e = await escenario();
      const [a, b] = [await crearCliente(n), await crearCliente(n)];
      const r = await Promise.allSettled([e.agendar(a, '19:00'), e.agendar(b, '19:00')]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(HorarioNoDisponible);
    });

    it('aplica el máximo de citas activas (canceladas y terminadas no cuentan)', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      await e.directa(clienteId, '2030-06-03', 'completada');
      await e.directa(clienteId, '2030-06-12', 'cancelada');
      await e.agendar(clienteId, '19:30');
      await e.agendar(clienteId, '20:00');
      await expect(e.agendar(clienteId, '20:30')).rejects.toBeInstanceOf(LimiteDeCitas);
    });

    it('sin límite (NULL) el cliente puede tener las citas que quiera', async () => {
      const otro = await crearNegocio('Sin límite');
      const b = await barbero(otro);
      await conSistema((tx) => tx.consultar('UPDATE configuracion_negocio SET max_citas_activas_cliente = NULL WHERE negocio_id = $1', [otro.negocioId]));
      const clienteId = await crearCliente(otro);
      for (const h of ['13:00', '13:30', '14:00']) {
        await crearCita(otro.negocioId, { profesionalId: b.profesionalId, clienteId, servicioIds: [b.corte], inicio: hora(h) }, AHORA);
      }
    });

    it('con 3 inasistencias en 30 días la cita nace por_aprobar con plazo de 2 horas', async () => {
      const e = await escenario();
      const cita = await e.agendar(await conInasistencias(e, 3), '21:00');
      expect(cita.estado).toBe('por_aprobar');
      expect(cita.aprobacionExpiraEn).toEqual(new Date('2030-06-09T14:00:00Z'));
    });

    it('con 2 inasistencias, o con 3 de hace más de 30 días, la cita es pendiente', async () => {
      const e = await escenario();
      expect((await e.agendar(await conInasistencias(e, 2), '21:30')).estado).toBe('pendiente');
      const viejas = await crearCliente(n);
      for (const dia of ['2030-04-01', '2030-04-02', '2030-04-03']) await e.directa(viejas, dia, 'no_asistio');
      expect((await e.agendar(viejas, '22:00')).estado).toBe('pendiente');
    });

    it('las inasistencias de otro negocio no cuentan', async () => {
      const e = await escenario();
      const otro = await crearNegocio('Otro');
      const prof = await crearProfesional(otro);
      const clienteOtro = await crearCliente(otro);
      for (const dia of ['2030-05-20', '2030-05-25', '2030-06-01']) {
        await insertarCita(otro, { profesionalId: prof, clienteId: clienteOtro, inicio: hora('13:00', dia), fin: hora('13:30', dia), estado: 'no_asistio' });
      }
      expect((await e.agendar(await crearCliente(n), '22:30')).estado).toBe('pendiente');
    });

    it('el plazo de aprobación nunca pasa de 1 h antes de la cita; si ya no hay tiempo, se rechaza', async () => {
      const e = await escenario();
      const clienteId = await conInasistencias(e, 3);
      const ahora = hora('13:00'); // 08:00 local
      const cita = await e.agendar(clienteId, '14:30', [e.corte], ahora); // 09:30 local → tope 08:30
      expect(cita.estado).toBe('por_aprobar');
      expect(cita.aprobacionExpiraEn).toEqual(hora('13:30'));
      await expect(e.agendar(clienteId, '14:00', [e.corte], ahora)).rejects.toBeInstanceOf(HorarioNoDisponible);
    });

    it('aplica el límite de citas del mes del plan y deshace todo al superarlo', async () => {
      const otro = await crearNegocio('Con plan');
      const b = await barbero(otro);
      const planId = randomUUID();
      planesCreados.push(planId);
      await conSistema(async (tx) => {
        await tx.consultar('INSERT INTO planes (id, nombre, precio_mensual_cop, max_citas_mes) VALUES ($1, $2, 0, 1)', [planId, `plan-${planId}`]);
        await tx.consultar('UPDATE negocios SET plan_id = $2 WHERE id = $1', [otro.negocioId, planId]);
      });
      const clienteId = await crearCliente(otro);
      const pedir = (h: string) => crearCita(otro.negocioId, { profesionalId: b.profesionalId, clienteId, servicioIds: [b.corte], inicio: hora(h) }, AHORA);
      await pedir('13:00');
      await expect(pedir('14:00')).rejects.toBeInstanceOf(LimiteDelPlan);
      const citas = await conNegocio(otro.negocioId, async (tx) => (await tx.consultar('SELECT 1 FROM citas')).rowCount);
      const uso = await conNegocio(otro.negocioId, async (tx) => (await tx.consultar<{ c: number }>('SELECT citas_creadas AS c FROM uso_mensual')).rows[0]!.c);
      expect([citas, uso]).toEqual([1, 1]);
    });

    it('un negocio suspendido no agenda', async () => {
      const otro = await crearNegocio('Suspendido');
      const b = await barbero(otro);
      const clienteId = await crearCliente(otro);
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [otro.negocioId]));
      await expect(
        crearCita(otro.negocioId, { profesionalId: b.profesionalId, clienteId, servicioIds: [b.corte], inicio: hora('13:00') }, AHORA),
      ).rejects.toBeInstanceOf(Prohibido);
    });

    it('valida la entrada y que barbero, cliente y servicios sean de este negocio', async () => {
      const e = await escenario();
      const base = { profesionalId: e.profesionalId, clienteId: await crearCliente(n), servicioIds: [e.corte], inicio: hora('14:00') };
      for (const caso of [
        { ...base, profesionalId: 'x' }, { ...base, clienteId: 'x' }, { ...base, servicioIds: [] },
        { ...base, servicioIds: [e.corte, e.corte] }, { ...base, inicio: new Date('no') },
        { ...base, notas: 'a'.repeat(501) },
      ]) {
        await expect(crearCita(n.negocioId, caso, AHORA)).rejects.toBeInstanceOf(DatosInvalidos);
      }
      const otro = await crearNegocio('Ajeno');
      const profAjeno = await crearProfesional(otro);
      const srvAjeno = await crearServicio(otro, profAjeno);
      const clienteAjeno = await crearCliente(otro);
      await expect(crearCita(n.negocioId, { ...base, profesionalId: profAjeno }, AHORA)).rejects.toBeInstanceOf(NoEncontrado);
      await expect(crearCita(n.negocioId, { ...base, clienteId: clienteAjeno }, AHORA)).rejects.toBeInstanceOf(NoEncontrado);
      await expect(crearCita(n.negocioId, { ...base, servicioIds: [srvAjeno] }, AHORA)).rejects.toBeInstanceOf(DatosInvalidos);
    });
  });

  describe('cancelarCita', () => {
    it('el cliente cancela a tiempo y el hueco queda libre', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const cita = await e.agendar(clienteId, '14:00');
      const cancelada = await cancelarCita(n.negocioId, cita.id, { tipo: 'cliente', clienteId }, AHORA);
      expect(cancelada.estado).toBe('cancelada');
      expect(await leer('SELECT cancelada_por, cancelada_en FROM citas WHERE id = $1', [cita.id])).toEqual([
        { cancelada_por: 'cliente', cancelada_en: AHORA },
      ]);
      await e.agendar(await crearCliente(n), '14:00');
    });

    it('el cliente no puede cancelar con menos de 2 h; el negocio sí', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const cita = await e.agendar(clienteId, '14:00'); // 09:00 local
      const ahora = hora('13:30'); // 08:30 local: faltan 30 min
      await expect(cancelarCita(n.negocioId, cita.id, { tipo: 'cliente', clienteId }, ahora)).rejects.toBeInstanceOf(FueraDePlazo);
      expect((await cancelarCita(n.negocioId, cita.id, { tipo: 'negocio' }, ahora)).estado).toBe('cancelada');
      expect(await leer('SELECT cancelada_por FROM citas WHERE id = $1', [cita.id])).toEqual([{ cancelada_por: 'negocio' }]);
    });

    it('un cliente no puede tocar la cita de otro', async () => {
      const e = await escenario();
      const cita = await e.agendar(await crearCliente(n), '14:00');
      const intruso = { tipo: 'cliente', clienteId: await crearCliente(n) } as const;
      await expect(cancelarCita(n.negocioId, cita.id, intruso, AHORA)).rejects.toBeInstanceOf(NoEncontrado);
      await expect(reprogramarCita(n.negocioId, cita.id, hora('14:30'), intruso, AHORA)).rejects.toBeInstanceOf(NoEncontrado);
    });

    it('otro negocio no puede cancelar la cita', async () => {
      const e = await escenario();
      const cita = await e.agendar(await crearCliente(n), '14:00');
      const otro = await crearNegocio('Vecino');
      await expect(cancelarCita(otro.negocioId, cita.id, { tipo: 'negocio' }, AHORA)).rejects.toBeInstanceOf(NoEncontrado);
    });

    it('no se cancela lo que ya está cancelado o terminado', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const cita = await e.agendar(clienteId, '14:00');
      await cancelarCita(n.negocioId, cita.id, { tipo: 'negocio' }, AHORA);
      await expect(cancelarCita(n.negocioId, cita.id, { tipo: 'negocio' }, AHORA)).rejects.toBeInstanceOf(TransicionNoPermitida);
      const hecha = await e.directa(clienteId, '2030-06-04', 'completada');
      await expect(cancelarCita(n.negocioId, hecha, { tipo: 'negocio' }, AHORA)).rejects.toBeInstanceOf(TransicionNoPermitida);
    });
  });

  describe('reprogramarCita', () => {
    it('mueve la misma cita, conserva la duración y reinicia el recordatorio', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const cita = await e.agendar(clienteId, '15:30');
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar(`UPDATE citas SET recordatorio_enviado_en = now(), recordatorio_resultado = 'enviado', recordatorio_intentos = 1 WHERE id = $1`, [cita.id]),
      );
      // 15:30 → 15:45 se cruza con su propio hueco anterior y debe poder.
      const despues = new Date(AHORA.getTime() + 60_000);
      const movida = await reprogramarCita(n.negocioId, cita.id, hora('15:45'), { tipo: 'cliente', clienteId }, despues);
      expect([movida.id, movida.inicio, movida.fin]).toEqual([cita.id, hora('15:45'), hora('16:15')]);
      expect(
        await leer('SELECT recordatorio_enviado_en AS r, recordatorio_resultado AS res, recordatorio_intentos AS i, programada_en AS p FROM citas WHERE id = $1', [cita.id]),
      ).toEqual([{ r: null, res: null, i: 0, p: despues }]);
    });

    it('rechaza un hueco ocupado por otra cita y deja la cita como estaba', async () => {
      const e = await escenario();
      await e.agendar(await crearCliente(n), '19:00');
      const cita = await e.agendar(await crearCliente(n), '19:30');
      await expect(reprogramarCita(n.negocioId, cita.id, hora('19:15'), { tipo: 'negocio' }, AHORA)).rejects.toBeInstanceOf(HorarioNoDisponible);
      expect(await leer('SELECT inicio FROM citas WHERE id = $1', [cita.id])).toEqual([{ inicio: hora('19:30') }]);
    });

    it('el cliente respeta el plazo; el negocio no', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const cita = await e.agendar(clienteId, '15:30'); // 10:30 local
      const ahora = hora('13:45'); // faltan 1 h 45 min
      await expect(reprogramarCita(n.negocioId, cita.id, hora('16:00'), { tipo: 'cliente', clienteId }, ahora)).rejects.toBeInstanceOf(FueraDePlazo);
      expect((await reprogramarCita(n.negocioId, cita.id, hora('16:00'), { tipo: 'negocio' }, ahora)).inicio).toEqual(hora('16:00'));
    });

    it('no reprograma citas por aprobar ni canceladas', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      for (const estado of ['por_aprobar', 'cancelada'] as const) {
        const id = await e.directa(clienteId, '2030-06-17', estado);
        await expect(reprogramarCita(n.negocioId, id, hora('14:00'), { tipo: 'negocio' }, AHORA)).rejects.toBeInstanceOf(TransicionNoPermitida);
      }
    });
  });

  describe('aprobar y rechazar', () => {
    it('aprobar pasa la cita a pendiente y limpia el plazo', async () => {
      const e = await escenario();
      const id = await e.directa(await crearCliente(n), '2030-06-17', 'por_aprobar'); // plazo: now() + 2 h
      const cita = await aprobarCita(n.negocioId, id);
      expect([cita.estado, cita.aprobacionExpiraEn]).toEqual(['pendiente', null]);
    });

    it('no se aprueba con el plazo vencido ni lo que no está por aprobar', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      const vencida = await e.directa(clienteId, '2030-06-17', 'por_aprobar');
      await expect(aprobarCita(n.negocioId, vencida, hora('13:00'))).rejects.toBeInstanceOf(FueraDePlazo);
      const pendiente = (await e.agendar(clienteId, '14:00')).id;
      await expect(aprobarCita(n.negocioId, pendiente)).rejects.toBeInstanceOf(TransicionNoPermitida);
      await expect(rechazarCita(n.negocioId, pendiente)).rejects.toBeInstanceOf(TransicionNoPermitida);
    });

    it('rechazar cancela la cita por el negocio y libera el hueco', async () => {
      const e = await escenario();
      const clienteId = await conInasistencias(e, 3);
      const cita = await e.agendar(clienteId, '15:00');
      const r = await rechazarCita(n.negocioId, cita.id, AHORA);
      expect([r.estado, r.aprobacionExpiraEn]).toEqual(['cancelada', null]);
      expect(await leer('SELECT cancelada_por FROM citas WHERE id = $1', [cita.id])).toEqual([{ cancelada_por: 'negocio' }]);
      await e.agendar(await crearCliente(n), '15:00');
    });
  });

  describe('marcarCita', () => {
    it('solo se marca desde que la cita empieza, y se puede corregir', async () => {
      const e = await escenario();
      const cita = await e.agendar(await crearCliente(n), '14:00');
      await expect(marcarCita(n.negocioId, cita.id, 'no_asistio', AHORA)).rejects.toBeInstanceOf(TransicionNoPermitida);
      const despues = hora('15:00');
      expect((await marcarCita(n.negocioId, cita.id, 'no_asistio', despues)).estado).toBe('no_asistio');
      expect((await marcarCita(n.negocioId, cita.id, 'completada', despues)).estado).toBe('completada');
    });

    it('la base impide marcar una cita por aprobar o cancelada', async () => {
      const e = await escenario();
      const clienteId = await crearCliente(n);
      for (const estado of ['por_aprobar', 'cancelada'] as const) {
        const id = await e.directa(clienteId, '2030-06-17', estado);
        await expect(marcarCita(n.negocioId, id, 'completada', hora('15:00', '2030-06-18'))).rejects.toBeInstanceOf(TransicionNoPermitida);
      }
    });
  });
});
