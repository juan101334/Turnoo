import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FueraDePlazo } from '../src/compartido/errores.js';
import { logger } from '../src/compartido/logger.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { aprobarCita, marcarCita } from '../src/modulos/citas/citas.servicio.js';
import { iniciarTareas } from '../src/tareas/programador.js';
import {
  autocompletarCitas,
  CANDADOS,
  ejecutarCiclo,
  ESPACIO_CANDADOS,
  expirarAprobaciones,
  LIMITE_POR_CICLO,
  limpiarIntentosLogin,
  type Tarea,
} from '../src/tareas/tareas.js';
import {
  cambiarEstado,
  crearCita,
  crearCliente,
  crearNegocio,
  crearProfesional,
  limpiar,
  type EstadoCita,
  type NegocioDePrueba,
} from './ayudas.js';

const AHORA = new Date('2035-03-10T12:00:00Z');
const HORA_MS = 3_600_000;
const antes = (ms: number) => new Date(AHORA.getTime() - ms);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('tareas internas', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;

  beforeAll(async () => {
    a = await crearNegocio('A');
    b = await crearNegocio('B');
  });
  afterAll(limpiar);
  afterEach(() => vi.restoreAllMocks());

  interface FilaCita {
    estado: EstadoCita;
    cancelada_por: string | null;
    cancelada_en: Date | null;
    aprobacion_expira_en: Date | null;
  }
  const leerCita = async (n: NegocioDePrueba, id: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<FilaCita>(
          'SELECT estado, cancelada_por, cancelada_en, aprobacion_expira_en FROM citas WHERE id = $1',
          [id],
        )
      ).rows[0]!,
    );

  /** Cita con barbero propio, para que nunca choque con otra, que terminó en `fin`. */
  async function citaQueTermina(n: NegocioDePrueba, fin: Date, estado?: EstadoCita) {
    return crearCita(n, {
      profesionalId: await crearProfesional(n),
      clienteId: await crearCliente(n),
      inicio: new Date(fin.getTime() - HORA_MS / 2),
      fin,
      ...(estado && { estado }),
    });
  }

  /** Cita `por_aprobar` en el futuro de AHORA, cuyo plazo vence en `plazo`. */
  async function porAprobar(n: NegocioDePrueba, plazo: Date, profesionalId?: string) {
    const id = await crearCita(n, {
      profesionalId: profesionalId ?? (await crearProfesional(n)),
      clienteId: await crearCliente(n),
      inicio: new Date(AHORA.getTime() + 5 * HORA_MS),
      fin: new Date(AHORA.getTime() + 5.5 * HORA_MS),
      estado: 'por_aprobar',
    });
    await conNegocio(n.negocioId, (tx) =>
      tx.consultar('UPDATE citas SET aprobacion_expira_en = $2 WHERE id = $1', [id, plazo]),
    );
    return id;
  }

  /** Muchas citas muy viejas: las primeras en el orden de las tareas, sin importar qué más exista. */
  async function muchasCitas(n: NegocioDePrueba, cantidad: number, estado: 'pendiente' | 'por_aprobar') {
    const profesionalId = await crearProfesional(n);
    const clienteId = await crearCliente(n);
    await conNegocio(n.negocioId, (tx) =>
      tx.consultar(
        `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin, estado, aprobacion_expira_en)
         SELECT $1, $2, $3, $4,
                '2001-01-01Z'::timestamptz + make_interval(mins => i),
                '2001-01-01Z'::timestamptz + make_interval(mins => i + 1),
                $5::text,
                CASE WHEN $5::text = 'por_aprobar' THEN '2001-01-01Z'::timestamptz END
           FROM generate_series(1, $6::int) AS i`,
        [n.negocioId, n.sedeId, profesionalId, clienteId, estado, cantidad],
      ),
    );
    return profesionalId;
  }

  const contarPorEstado = (n: NegocioDePrueba, profesionalId: string, estado: EstadoCita) =>
    conNegocio(n.negocioId, async (tx) =>
      (
        await tx.consultar<{ total: number }>(
          'SELECT count(*)::int AS total FROM citas WHERE profesional_id = $1 AND estado = $2',
          [profesionalId, estado],
        )
      ).rows[0]!.total,
    );

  describe('autocompletar citas', () => {
    it('completa a las 24 h exactas desde el fin, y no un segundo antes', async () => {
      const justo = await citaQueTermina(a, antes(24 * HORA_MS));
      const casi = await citaQueTermina(a, antes(24 * HORA_MS - 1000));
      await autocompletarCitas(AHORA);
      expect((await leerCita(a, justo)).estado).toBe('completada');
      expect((await leerCita(a, casi)).estado).toBe('pendiente');
    });

    it('también completa las confirmadas, sin dejar rastro de cancelación', async () => {
      const id = await citaQueTermina(a, antes(30 * HORA_MS));
      await cambiarEstado(a, id, 'confirmada');
      await autocompletarCitas(AHORA);
      expect(await leerCita(a, id)).toMatchObject({ estado: 'completada', cancelada_por: null, cancelada_en: null });
    });

    it('respeta las horas configuradas en cada negocio', async () => {
      const paciente = await crearNegocio('Espera 48 h');
      await conNegocio(paciente.negocioId, (tx) =>
        tx.consultar('UPDATE configuracion_negocio SET horas_autocompletar_cita = 48'),
      );
      const conEspera = await citaQueTermina(paciente, antes(30 * HORA_MS));
      const vencida = await citaQueTermina(paciente, antes(48 * HORA_MS));
      const normal = await citaQueTermina(b, antes(30 * HORA_MS));
      await autocompletarCitas(AHORA);
      expect((await leerCita(paciente, conEspera)).estado).toBe('pendiente');
      expect((await leerCita(paciente, vencida)).estado).toBe('completada');
      expect((await leerCita(b, normal)).estado).toBe('completada');
    });

    it.each(['cancelada', 'no_asistio', 'completada'] as const)('no toca una cita %s', async (estado) => {
      const id = await citaQueTermina(a, antes(100 * HORA_MS), estado);
      await autocompletarCitas(AHORA);
      expect((await leerCita(a, id)).estado).toBe(estado);
    });

    it('no toca una por_aprobar, aunque ya haya terminado', async () => {
      const id = await citaQueTermina(a, antes(100 * HORA_MS), 'por_aprobar');
      await conNegocio(a.negocioId, (tx) =>
        tx.consultar('UPDATE citas SET aprobacion_expira_en = $2 WHERE id = $1', [id, new Date(AHORA.getTime() + HORA_MS)]),
      );
      await autocompletarCitas(AHORA);
      expect((await leerCita(a, id)).estado).toBe('por_aprobar');
    });

    it('corre en un negocio suspendido, y al reactivarlo se puede corregir a no_asistio', async () => {
      const n = await crearNegocio('Suspendido');
      const id = await citaQueTermina(n, antes(30 * HORA_MS));
      const estado = (valor: string) =>
        conSistema((tx) => tx.consultar('UPDATE negocios SET estado = $2 WHERE id = $1', [n.negocioId, valor]));
      await estado('suspendido');
      await autocompletarCitas(AHORA);
      expect((await leerCita(n, id)).estado).toBe('completada');
      await estado('activo');
      await marcarCita(n.negocioId, id, 'no_asistio', AHORA);
      expect((await leerCita(n, id)).estado).toBe('no_asistio');
    });

    it('correr dos veces no cambia nada más', async () => {
      await citaQueTermina(a, antes(30 * HORA_MS));
      expect(await autocompletarCitas(AHORA)).toBeGreaterThan(0);
      expect(await autocompletarCitas(AHORA)).toBe(0);
    });

    it('procesa hasta 500 por ciclo y deja el resto para el siguiente', async () => {
      expect(LIMITE_POR_CICLO).toBe(500);
      const barbero = await muchasCitas(a, LIMITE_POR_CICLO + 1, 'pendiente');
      expect(await autocompletarCitas(AHORA)).toBe(LIMITE_POR_CICLO);
      expect(await contarPorEstado(a, barbero, 'pendiente')).toBe(1);
      await autocompletarCitas(AHORA);
      expect(await contarPorEstado(a, barbero, 'pendiente')).toBe(0);
    });

    it('no pisa a un barbero que está marcando esa cita', async () => {
      const id = await citaQueTermina(a, antes(30 * HORA_MS));
      await conNegocio(a.negocioId, async (tx) => {
        await tx.consultar("UPDATE citas SET estado = 'no_asistio' WHERE id = $1", [id]);
        // Sin SKIP LOCKED, la tarea se quedaría esperando a esta transacción y la prueba no terminaría.
        await autocompletarCitas(AHORA);
      });
      await autocompletarCitas(AHORA);
      expect((await leerCita(a, id)).estado).toBe('no_asistio');
    });
  });

  describe('expirar aprobaciones', () => {
    it('cancela con el plazo exacto, y no un segundo antes', async () => {
      const justo = await porAprobar(a, AHORA);
      const casi = await porAprobar(a, new Date(AHORA.getTime() + 1000));
      await expirarAprobaciones(AHORA);
      expect(await leerCita(a, justo)).toEqual({
        estado: 'cancelada',
        cancelada_por: 'sistema',
        cancelada_en: AHORA,
        aprobacion_expira_en: null,
      });
      expect((await leerCita(a, casi)).estado).toBe('por_aprobar');
    });

    it('usa el mismo límite que aprobar: no hay un instante en que ninguna aplique', async () => {
      const id = await porAprobar(a, AHORA);
      await expect(aprobarCita(a.negocioId, id, AHORA)).rejects.toBeInstanceOf(FueraDePlazo);
      await expirarAprobaciones(AHORA);
      expect((await leerCita(a, id)).estado).toBe('cancelada');
    });

    it('libera el hueco: la misma hora se puede volver a agendar', async () => {
      const barbero = await crearProfesional(a);
      await porAprobar(a, antes(1000), barbero);
      const clienteId = await crearCliente(a);
      const nueva = () =>
        crearCita(a, {
          profesionalId: barbero,
          clienteId,
          inicio: new Date(AHORA.getTime() + 5 * HORA_MS),
          fin: new Date(AHORA.getTime() + 5.5 * HORA_MS),
        });
      await expect(nueva()).rejects.toMatchObject({ codigo: 'HORARIO_NO_DISPONIBLE' });
      await expirarAprobaciones(AHORA);
      await expect(nueva()).resolves.toEqual(expect.any(String));
    });

    it('cubre todos los negocios, incluidos los suspendidos', async () => {
      const n = await crearNegocio('Suspendido por aprobar');
      const suspendida = await porAprobar(n, antes(1000));
      const deB = await porAprobar(b, antes(1000));
      await conSistema((tx) => tx.consultar("UPDATE negocios SET estado = 'suspendido' WHERE id = $1", [n.negocioId]));
      await expirarAprobaciones(AHORA);
      expect((await leerCita(n, suspendida)).estado).toBe('cancelada');
      expect((await leerCita(b, deB)).estado).toBe('cancelada');
    });

    it('no toca una cita pendiente ni una cancelada por el negocio', async () => {
      const pendiente = await citaQueTermina(a, new Date(AHORA.getTime() + 9 * HORA_MS));
      const cancelada = await citaQueTermina(a, new Date(AHORA.getTime() + 9 * HORA_MS), 'cancelada');
      await expirarAprobaciones(AHORA);
      expect((await leerCita(a, pendiente)).estado).toBe('pendiente');
      expect((await leerCita(a, cancelada)).cancelada_por).toBe('negocio');
    });

    it('no pisa a un barbero que está aprobando esa cita', async () => {
      const id = await porAprobar(a, antes(1000));
      await conNegocio(a.negocioId, async (tx) => {
        await tx.consultar("UPDATE citas SET estado = 'pendiente' WHERE id = $1", [id]);
        await expirarAprobaciones(AHORA);
      });
      await expirarAprobaciones(AHORA);
      expect((await leerCita(a, id)).estado).toBe('pendiente');
    });

    it('procesa hasta 500 por ciclo y deja el resto para el siguiente', async () => {
      const barbero = await muchasCitas(a, LIMITE_POR_CICLO + 1, 'por_aprobar');
      expect(await expirarAprobaciones(AHORA)).toBe(LIMITE_POR_CICLO);
      expect(await contarPorEstado(a, barbero, 'por_aprobar')).toBe(1);
      await expirarAprobaciones(AHORA);
      expect(await contarPorEstado(a, barbero, 'por_aprobar')).toBe(0);
    });

    it('la base solo admite los tres valores de cancelada_por', async () => {
      const id = await citaQueTermina(a, antes(1000), 'cancelada');
      await expect(
        conNegocio(a.negocioId, (tx) => tx.consultar("UPDATE citas SET cancelada_por = 'robot' WHERE id = $1", [id])),
      ).rejects.toMatchObject({ constraint: 'citas_cancelada_por_check' });
    });
  });

  describe('limpiar intentos de login', () => {
    const insertar = (clave: string, ventana: Date) =>
      conSistema((tx) => tx.consultar('INSERT INTO intentos_login VALUES ($1, 1, $2)', [clave, ventana]));
    const existe = (clave: string) =>
      conSistema(async (tx) => (await tx.consultar('SELECT 1 FROM intentos_login WHERE clave = $1', [clave])).rowCount === 1);

    it('borra las ventanas vencidas a los 15 minutos exactos y conserva las vigentes', async () => {
      await insertar('vieja', antes(HORA_MS));
      await insertar('justa', antes(15 * 60_000));
      await insertar('vigente', antes(15 * 60_000 - 1000));
      expect(await limpiarIntentosLogin(AHORA)).toBeGreaterThanOrEqual(2);
      expect(await existe('vieja')).toBe(false);
      expect(await existe('justa')).toBe(false);
      expect(await existe('vigente')).toBe(true);
    });
  });

  describe('dos instancias a la vez', () => {
    const conCandadoTomado = (candado: number, trabajo: () => Promise<void>) =>
      conSistema(async (tx) => {
        const { rows } = await tx.consultar<{ tomado: boolean }>(
          'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS tomado',
          [ESPACIO_CANDADOS, candado],
        );
        expect(rows[0]!.tomado).toBe(true);
        await trabajo();
      });

    it.each([
      ['autocompletar', CANDADOS.autocompletar, () => autocompletarCitas(AHORA)],
      ['expirar', CANDADOS.expirar, () => expirarAprobaciones(AHORA)],
      ['limpiar', CANDADOS.limpiar, () => limpiarIntentosLogin(AHORA)],
    ])('%s se salta el ciclo si otra instancia lo está corriendo', async (_nombre, candado, tarea) => {
      await conCandadoTomado(candado, async () => {
        expect(await tarea()).toBeNull();
      });
      expect(await tarea()).not.toBeNull();
    });

    it('el saltado no cambia nada, y cada tarea tiene su propio candado', async () => {
      const id = await citaQueTermina(a, antes(30 * HORA_MS));
      await conCandadoTomado(CANDADOS.autocompletar, async () => {
        expect(await autocompletarCitas(AHORA)).toBeNull();
        expect(await expirarAprobaciones(AHORA)).not.toBeNull();
        expect((await leerCita(a, id)).estado).toBe('pendiente');
      });
    });

    it('a la vez, cada cita se procesa una sola vez', async () => {
      await autocompletarCitas(AHORA);
      const barbero = await muchasCitas(a, 50, 'pendiente');
      const cuentas = await Promise.all(Array.from({ length: 6 }, () => autocompletarCitas(AHORA)));
      expect(cuentas.reduce<number>((suma, c) => suma + (c ?? 0), 0)).toBe(50);
      expect(await contarPorEstado(a, barbero, 'completada')).toBe(50);
    });
  });

  describe('ciclo y log', () => {
    const tarea = (nombre: string, ejecutar: Tarea['ejecutar']): Tarea => ({ nombre, ejecutar });

    it('con cambios registra una línea informativa con nombre, cantidad y duración', async () => {
      const info = vi.spyOn(logger, 'info');
      const debug = vi.spyOn(logger, 'debug');
      await ejecutarCiclo(AHORA, [tarea('con_cambios', async () => 3)]);
      expect(info).toHaveBeenCalledWith(
        { tarea: 'con_cambios', cantidad: 3, duracionMs: expect.any(Number) },
        'Tarea interna con cambios',
      );
      expect(debug).not.toHaveBeenCalled();
    });

    it.each([[0], [null]])('sin cambios (%s) solo registra en debug', async (cantidad) => {
      const info = vi.spyOn(logger, 'info');
      const debug = vi.spyOn(logger, 'debug');
      await ejecutarCiclo(AHORA, [tarea('sin_cambios', async () => cantidad)]);
      expect(info).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledOnce();
    });

    it('el fallo de una tarea se registra, no se propaga y no frena a las demás', async () => {
      const error = vi.spyOn(logger, 'error');
      const siguiente = vi.fn(async () => 0);
      await expect(
        ejecutarCiclo(AHORA, [
          tarea('falla', async () => {
            throw Object.assign(new Error('se rompió'), { code: '23514', detail: 'Failing row contains (573001234567)' });
          }),
          tarea('siguiente', siguiente),
        ]),
      ).resolves.toBeUndefined();
      expect(siguiente).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalledOnce();
      const [datos] = error.mock.calls[0]! as unknown as [{ tarea: string; fallo: { mensaje: string; codigo: string } }];
      expect(datos.tarea).toBe('falla');
      expect(datos.fallo).toMatchObject({ mensaje: 'se rompió', codigo: '23514' });
      expect(JSON.stringify(datos)).not.toContain('573001234567');
    });

    it('un ciclo real corre las tres tareas', async () => {
      const completar = await citaQueTermina(a, antes(30 * HORA_MS));
      const expirar = await porAprobar(a, antes(1000));
      await conSistema((tx) => tx.consultar("INSERT INTO intentos_login VALUES ('del-ciclo', 1, $1)", [antes(HORA_MS)]));
      await ejecutarCiclo(AHORA);
      expect((await leerCita(a, completar)).estado).toBe('completada');
      expect((await leerCita(a, expirar)).estado).toBe('cancelada');
      const { rowCount } = await conSistema((tx) => tx.consultar("SELECT 1 FROM intentos_login WHERE clave = 'del-ciclo'"));
      expect(rowCount).toBe(0);
    });

    it('un ciclo real no registra datos de clientes', async () => {
      const cliente = await crearCliente(a, 'Nombre Privado');
      const { rows } = await conNegocio(a.negocioId, (tx) =>
        tx.consultar<{ telefono: string }>('SELECT telefono FROM clientes WHERE id = $1', [cliente]),
      );
      await crearCita(a, {
        profesionalId: await crearProfesional(a),
        clienteId: cliente,
        inicio: antes(30 * HORA_MS),
        fin: antes(29 * HORA_MS),
      });
      const info = vi.spyOn(logger, 'info');
      await ejecutarCiclo(AHORA);
      const registrado = JSON.stringify(info.mock.calls);
      expect(registrado).toContain('autocompletar_citas');
      expect(registrado).not.toContain(rows[0]!.telefono);
      expect(registrado).not.toContain('Nombre Privado');
    });
  });

  describe('programador', () => {
    const esperarHasta = async (condicion: () => boolean) => {
      for (let i = 0; i < 200 && !condicion(); i += 1) await espera(5);
      expect(condicion()).toBe(true);
    };

    it('corre al arrancar y luego se repite', async () => {
      const ejecutar = vi.fn(async () => 0);
      const programador = iniciarTareas({ cadaMs: 5, tareas: [{ nombre: 'x', ejecutar }] });
      expect(ejecutar).toHaveBeenCalledOnce();
      await esperarHasta(() => ejecutar.mock.calls.length >= 3);
      await programador.detener();
    });

    it('sigue corriendo después de un fallo', async () => {
      const ejecutar = vi.fn(async (): Promise<number> => {
        throw new Error('falla siempre');
      });
      const programador = iniciarTareas({ cadaMs: 5, tareas: [{ nombre: 'x', ejecutar }] });
      await esperarHasta(() => ejecutar.mock.calls.length >= 3);
      await programador.detener();
    });

    it('dos ciclos nunca se pisan, aunque uno tarde más que el intervalo', async () => {
      let enCurso = 0;
      let maximo = 0;
      let vueltas = 0;
      const programador = iniciarTareas({
        cadaMs: 1,
        tareas: [
          {
            nombre: 'lenta',
            ejecutar: async () => {
              enCurso += 1;
              maximo = Math.max(maximo, enCurso);
              await espera(20);
              enCurso -= 1;
              vueltas += 1;
              return 0;
            },
          },
        ],
      });
      await esperarHasta(() => vueltas >= 3);
      await programador.detener();
      expect(maximo).toBe(1);
    });

    it('detener espera el ciclo en curso y no programa más', async () => {
      let terminadas = 0;
      const ejecutar = vi.fn(async () => {
        await espera(30);
        terminadas += 1;
        return 0;
      });
      const programador = iniciarTareas({ cadaMs: 1, tareas: [{ nombre: 'x', ejecutar }] });
      await programador.detener();
      expect(terminadas).toBe(1);
      const llamadas = ejecutar.mock.calls.length;
      await espera(30);
      expect(ejecutar.mock.calls.length).toBe(llamadas);
    });
  });
});
