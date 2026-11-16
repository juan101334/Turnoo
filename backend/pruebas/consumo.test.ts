import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { primerDiaDelMes } from '../src/compartido/tiempo.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { consumoDeNegocio, consumoPorNegocio, resumenDeConsumo, type Tarifas } from '../src/modulos/uso/consumo.servicio.js';
import { sumarPlantilla, sumarSegundosDeAudio } from '../src/modulos/uso/uso.repositorio.js';
import { registrarTokens } from '../src/modulos/uso/uso.servicio.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearCita, crearCliente, crearNegocio, crearProfesional, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const ZONA = 'America/Bogota';
const DIA_MS = 86_400_000;
/** Viernes 16 de mayo de 2036, 9:00 a. m. en Bogotá. Un mes que ninguna otra prueba usa. */
const T = new Date('2036-05-16T14:00:00Z');
const MES = '2036-05';
const MAYO = '2036-05-01';
/** 1 de junio a las 3:00 UTC: todavía 31 de mayo, 10:00 p. m., en Bogotá. */
const BORDE = new Date('2036-06-01T03:00:00Z');
const dias = (n: number) => new Date(T.getTime() + n * DIA_MS);

/** Valores FICTICIOS y redondos, solo para comprobar la cuenta. No son tarifas reales de nadie. */
const TARIFAS_FICTICIAS: Tarifas = { iaEntradaCopMillon: 1000, iaSalidaCopMillon: 2000, audioCopMinuto: 60, plantillaUtilidadCop: 10 };

// Datos de clientes que NO deben aparecer en ninguna respuesta.
const SECRETOS = { nombre: 'Cliente Secreto Zeta', telefono: '573009998877', mensaje: 'contenido-secreto-del-mensaje', detalle: 'detalle-secreto-de-la-derivacion' };

describe('panel de consumo del superadmin', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let planId: string;
  const superadmins: string[] = [];
  const tokens = {} as Record<'superadmin' | 'duenoA' | 'empleadoA', string>;

  const sistema = async <F extends object>(texto: string, params: unknown[] = []) =>
    (await conSistema((tx) => tx.consultar<F>(texto, params))).rows;

  async function usuario(n: NegocioDePrueba | null, rol: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const [fila] = await sistema<{ id: string }>(
      `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash) VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`,
      [n?.negocioId ?? null, email, rol, await argon2.hash(CLAVE)],
    );
    if (!n) superadmins.push(fila!.id);
    const r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return (await r.json()).token as string;
  }

  const pedir = (ruta: string, token?: string) => fetch(base + ruta, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  /** Lo que gasta un negocio, por el mismo camino que usa la aplicación. */
  const gastar = {
    tokens: (n: NegocioDePrueba, entrada: number, salida: number, ahora = T) =>
      registrarTokens(n.negocioId, ZONA, ahora, { entrada, salida }, 'modelo-de-prueba'),
    audio: (n: NegocioDePrueba, segundos: number, ahora = T) =>
      conNegocio(n.negocioId, (tx) => sumarSegundosDeAudio(tx, n.negocioId, primerDiaDelMes(ahora, ZONA), segundos, ahora, 'audio-de-prueba')),
    plantilla: (n: NegocioDePrueba, ahora = T) =>
      conNegocio(n.negocioId, (tx) => sumarPlantilla(tx, n.negocioId, primerDiaDelMes(ahora, ZONA), ahora, 'utilidad')),
  };

  const conversacionesIa = (n: NegocioDePrueba, cantidad: number) =>
    sistema(
      `INSERT INTO uso_mensual (negocio_id, periodo, conversaciones_ia) VALUES ($1, $2, $3)
       ON CONFLICT (negocio_id, periodo) DO UPDATE SET conversaciones_ia = EXCLUDED.conversaciones_ia`,
      [n.negocioId, MAYO, cantidad],
    );

  const fijar = (n: NegocioDePrueba, columnas: string, params: unknown[]) =>
    sistema(`UPDATE negocios SET ${columnas} WHERE id = $1`, [n.negocioId, ...params]);

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('Consumo A');
    b = await crearNegocio('Consumo B');
    tokens.superadmin = await usuario(null, 'superadmin');
    tokens.duenoA = await usuario(a, 'dueno');
    tokens.empleadoA = await usuario(a, 'empleado');

    const [plan] = await sistema<{ id: string }>(
      'INSERT INTO planes (nombre, precio_mensual_cop, max_conversaciones_ia_mes) VALUES ($1, 50000, 10) RETURNING id',
      [`Plan ${randomUUID()}`],
    );
    planId = plan!.id;
    await fijar(a, 'plan_id = $2', [planId]);
    await fijar(b, 'plan_id = $2', [planId]);

    // Negocio A en mayo de 2036.
    await gastar.tokens(a, 600_000, 300_000);
    await gastar.tokens(a, 400_000, 200_000, dias(1));
    await gastar.audio(a, 60);
    await gastar.audio(a, 30, dias(1));
    await gastar.plantilla(a);
    await gastar.plantilla(a);
    await gastar.plantilla(a, dias(1));
    await gastar.plantilla(a, BORDE);
    await conversacionesIa(a, 8);

    // Negocio B, con cifras distintas para notar cualquier mezcla.
    await gastar.tokens(b, 7000, 700);
    await gastar.plantilla(b);
    await conversacionesIa(b, 7);

    // Citas de A en mayo: 2 completadas, 1 inasistencia, 1 cancelada y 1 pendiente. Una más en junio.
    const barbero = await crearProfesional(a);
    const cliente = await crearCliente(a, SECRETOS.nombre);
    const cita = (inicio: Date, estado: Parameters<typeof crearCita>[1]['estado']) =>
      crearCita(a, { profesionalId: barbero, clienteId: cliente, inicio, fin: new Date(inicio.getTime() + 1_800_000), estado });
    await cita(dias(-3), 'completada');
    await cita(dias(-2), 'completada');
    const sinAsistir = await cita(dias(-1), 'no_asistio');
    await cita(dias(2), 'cancelada');
    await cita(dias(3), 'pendiente');
    await cita(dias(20), 'pendiente');
    await sistema(`UPDATE citas SET recordatorio_resultado = 'fallido' WHERE id = $1`, [sinAsistir]);

    // Una conversación de A con una derivación sin poder avisar y un mensaje que WhatsApp rechazó.
    const cuenta = await registrarCuenta(a.negocioId, { phoneNumberId: `${Date.now()}77`, wabaId: '1', numeroVisible: '3000000001', token: 'EAAtoken-de-prueba-consumo' });
    await sistema('UPDATE clientes SET telefono = $2 WHERE id = $1', [cliente, SECRETOS.telefono]);
    const [conv] = await sistema<{ id: string }>(
      'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4) RETURNING id',
      [a.negocioId, cliente, cuenta.id, dias(-3)],
    );
    await sistema(
      `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, estado_entrega, creado_en) VALUES
         ($1, $2, 'entrante', 'cliente', 'texto', $3, NULL, $4),
         ($1, $2, 'saliente', 'ia', 'texto', $3, 'fallido', $4)`,
      [a.negocioId, conv!.id, SECRETOS.mensaje, T],
    );
    await sistema(
      `INSERT INTO derivaciones (negocio_id, conversacion_id, motivo, detalle, aviso_resultado, created_at) VALUES
         ($1, $2, 'sin_informacion', $3, 'fallido', $4),
         ($1, $2, 'sin_informacion', $3, 'vencido', $4),
         ($1, $2, 'limite_plan', $3, 'vencido', $4)`,
      [a.negocioId, conv!.id, SECRETOS.detalle, T],
    );
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await sistema('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]);
    await sistema('DELETE FROM planes WHERE id = $1', [planId]);
  });

  const rutas = () => ['/consumo', '/consumo/negocios', `/consumo/negocios/${a.negocioId}`];

  describe('acceso', () => {
    it('sin sesión responde 401', async () => {
      for (const ruta of rutas()) expect((await pedir(ruta)).status, ruta).toBe(401);
    });

    it('el dueño y el barbero reciben 403, también para su propio negocio', async () => {
      for (const ruta of rutas()) {
        expect((await pedir(ruta, tokens.duenoA)).status, ruta).toBe(403);
        expect((await pedir(ruta, tokens.empleadoA)).status, ruta).toBe(403);
      }
    });

    it('el superadmin entra a las tres', async () => {
      for (const ruta of rutas()) expect((await pedir(`${ruta}?mes=${MES}`, tokens.superadmin)).status, ruta).toBe(200);
    });

    it('rechaza un mes mal escrito y un parámetro desconocido', async () => {
      for (const consulta of ['mes=2036-13', 'mes=mayo', 'mes=2036-5', 'otro=1']) {
        expect((await pedir(`/consumo?${consulta}`, tokens.superadmin)).status, consulta).toBe(400);
      }
    });

    it('un negocio que no existe responde 404', async () => {
      expect((await pedir(`/consumo/negocios/${randomUUID()}`, tokens.superadmin)).status).toBe(404);
      expect((await pedir('/consumo/negocios/no-es-un-id', tokens.superadmin)).status).toBe(404);
    });
  });

  describe('registro de consumo', () => {
    it('cada negocio solo lee sus filas, aunque la consulta no filtre', async () => {
      const filas = (n: NegocioDePrueba) =>
        conNegocio(n.negocioId, async (tx) => (await tx.consultar<{ negocio_id: string }>('SELECT DISTINCT negocio_id FROM consumos')).rows);
      expect(await filas(a)).toEqual([{ negocio_id: a.negocioId }]);
      expect(await filas(b)).toEqual([{ negocio_id: b.negocioId }]);
    });

    it('un negocio no puede escribir consumo a nombre de otro', async () => {
      await expect(
        conNegocio(a.negocioId, (tx) =>
          tx.consultar(`INSERT INTO consumos (negocio_id, tipo, categoria_plantilla) VALUES ($1, 'plantilla', 'utilidad')`, [b.negocioId]),
        ),
      ).rejects.toThrow();
    });

    it('cada tipo lleva sus columnas y solo esas', async () => {
      const insertar = (columnas: string, valores: string) =>
        conNegocio(a.negocioId, (tx) => tx.consultar(`INSERT INTO consumos (negocio_id, tipo, ${columnas}) VALUES ($1, ${valores})`, [a.negocioId]));
      await expect(insertar('tokens_entrada, tokens_salida', `'ia_texto', 1, 1`)).rejects.toThrow(); // sin modelo
      await expect(insertar('segundos_audio', `'audio', 5`)).rejects.toThrow(); // sin modelo
      await expect(insertar('modelo', `'plantilla', 'x'`)).rejects.toThrow(); // sin categoría
      await expect(insertar('categoria_plantilla, segundos_audio', `'plantilla', 'utilidad', 5`)).rejects.toThrow();
    });

    it('el detalle suma lo mismo que uso_mensual, negocio por negocio', async () => {
      const detalle = await sistema(
        `SELECT c.negocio_id,
                count(*) FILTER (WHERE c.tipo = 'plantilla')::int AS plantillas,
                COALESCE(sum(c.segundos_audio), 0)::int AS segundos,
                COALESCE(sum(c.tokens_entrada), 0)::int AS entrada,
                COALESCE(sum(c.tokens_salida), 0)::int AS salida
           FROM consumos c JOIN negocios n ON n.id = c.negocio_id
          WHERE c.negocio_id = ANY($1::uuid[])
            AND date_trunc('month', c.creado_en AT TIME ZONE n.zona_horaria)::date = $2::date
          GROUP BY c.negocio_id ORDER BY c.negocio_id`,
        [[a.negocioId, b.negocioId], MAYO],
      );
      const total = await sistema(
        `SELECT negocio_id, plantillas_enviadas AS plantillas, segundos_audio_transcritos AS segundos,
                tokens_entrada::int AS entrada, tokens_salida::int AS salida
           FROM uso_mensual WHERE negocio_id = ANY($1::uuid[]) AND periodo = $2::date ORDER BY negocio_id`,
        [[a.negocioId, b.negocioId], MAYO],
      );
      expect(detalle).toHaveLength(2);
      expect(detalle).toEqual(total);
      // Y no quedó nada en junio: lo del 31 de mayo por la noche es de mayo en los dos registros.
      expect(await sistema(`SELECT 1 FROM uso_mensual WHERE negocio_id = $1 AND periodo = '2036-06-01'`, [a.negocioId])).toEqual([]);
    });
  });

  describe('por negocio', () => {
    it('el detalle de un negocio trae solo lo suyo', async () => {
      const r = await pedir(`/consumo/negocios/${a.negocioId}?mes=${MES}`, tokens.superadmin);
      const d = await r.json();
      expect(d).toMatchObject({
        mes: MES,
        negocioId: a.negocioId,
        nombre: 'Consumo A',
        estado: 'prueba',
        plan: { precioMensualCop: 50000, maxConversacionesIa: 10 },
        conversacionesIa: 8,
        porcentajeIa: 80,
        tokensEntrada: 1_000_000,
        tokensSalida: 500_000,
        segundosAudio: 90,
        plantillas: 4,
        citas: 5,
        citasPorEstado: { porAprobar: 0, pendientes: 1, confirmadas: 0, completadas: 2, canceladas: 1, noAsistio: 1 },
        canceladasPor: { cliente: 0, negocio: 1, sistema: 0 },
        porcentajeNoAsistio: 33.3,
        porcentajeCancelacion: 20,
        derivaciones: 3,
        derivacionesPorMotivo: [
          { motivo: 'sin_informacion', cantidad: 2 },
          { motivo: 'limite_plan', cantidad: 1 },
        ],
        fallos: { recordatorios: 1, avisos: 1, mensajes: 1 },
        fallosDeEnvio: 3,
      });
      expect(d.diario).toHaveLength(31);
      expect(d.diario[15]).toEqual({ fecha: '2036-05-16', atencionesIa: 1, plantillas: 2, segundosAudio: 60, citasCreadas: 0 });
      expect(d.diario[16]).toEqual({ fecha: '2036-05-17', atencionesIa: 1, plantillas: 1, segundosAudio: 30, citasCreadas: 0 });
      expect(d.diario[30]).toEqual({ fecha: '2036-05-31', atencionesIa: 0, plantillas: 1, segundosAudio: 0, citasCreadas: 0 });
      expect(d.detallePorDiaDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('otro mes no arrastra lo de mayo', async () => {
      const d = await consumoDeNegocio(a.negocioId, '2036-06', T, null);
      expect(d).toMatchObject({ mes: '2036-06', conversacionesIa: 0, tokensEntrada: 0, plantillas: 0, segundosAudio: 0, citas: 1, derivaciones: 0, fallosDeEnvio: 0 });
      expect(d.diario).toHaveLength(30);
      expect(d.diario.every((dia) => dia.atencionesIa === 0 && dia.plantillas === 0)).toBe(true);
    });

    it('los días sin actividad se cuentan desde el último mensaje de un cliente o la última cita creada', async () => {
      // El último mensaje de un cliente de A fue 3 días antes de T; B nunca tuvo actividad.
      const { negocios } = await consumoPorNegocio(MES, T, null);
      expect(negocios.find((n) => n.negocioId === a.negocioId)!.diasSinActividad).toBe(3);
      expect(negocios.find((n) => n.negocioId === b.negocioId)!.diasSinActividad).toBeNull();
    });

    it('la lista trae a cada negocio con lo suyo', async () => {
      const r = await pedir(`/consumo/negocios?mes=${MES}`, tokens.superadmin);
      const { negocios } = (await r.json()) as { negocios: { negocioId: string }[] };
      expect(negocios.find((n) => n.negocioId === a.negocioId)).toMatchObject({ conversacionesIa: 8, tokensEntrada: 1_000_000, plantillas: 4, citas: 5 });
      expect(negocios.find((n) => n.negocioId === b.negocioId)).toMatchObject({
        conversacionesIa: 7,
        porcentajeIa: 70,
        tokensEntrada: 7000,
        tokensSalida: 700,
        plantillas: 1,
        segundosAudio: 0,
        citas: 0,
        porcentajeNoAsistio: null,
        porcentajeCancelacion: null,
        derivaciones: 0,
        fallosDeEnvio: 0,
      });
    });
  });

  describe('resumen de la plataforma', () => {
    it('el total del mes es exactamente la suma de los negocios', async () => {
      const r = await pedir(`/consumo?mes=${MES}`, tokens.superadmin);
      const resumen = await r.json();
      // En mayo de 2036 solo existen los datos de A y B.
      expect(resumen.uso).toEqual({
        conversacionesIa: 15,
        plantillas: 5,
        segundosAudio: 90,
        tokensEntrada: 1_007_000,
        tokensSalida: 500_700,
        citas: 5,
      });
      expect(resumen.diario).toHaveLength(31);
      expect(resumen.diario[15]).toEqual({ fecha: '2036-05-16', atencionesIa: 2, plantillas: 3, segundosAudio: 60, citasCreadas: 0 });
    });

    it('el ingreso contratado solo suma el plan de los negocios activos', async () => {
      const antes = await resumenDeConsumo(MES, T, null);
      // A y B tienen plan, pero los dos están en prueba: todavía no pagan.
      await fijar(a, `estado = 'activo'`, []);
      const conA = await resumenDeConsumo(MES, T, null);
      expect(conA.mrrContratadoCop - antes.mrrContratadoCop).toBe(50000);
      expect(conA.negocios.activos - antes.negocios.activos).toBe(1);
      expect(conA.negocios.enPrueba - antes.negocios.enPrueba).toBe(-1);

      await fijar(a, `estado = 'suspendido'`, []);
      const suspendido = await resumenDeConsumo(MES, T, null);
      expect(suspendido.mrrContratadoCop).toBe(antes.mrrContratadoCop);
      expect(suspendido.negocios.suspendidos - antes.negocios.suspendidos).toBe(1);
      await fijar(a, `estado = 'prueba'`, []);
    });
  });

  describe('costo estimado', () => {
    it('sin tarifas no hay costo ni margen: solo unidades', async () => {
      const resumen = await resumenDeConsumo(MES, T, null);
      expect(resumen.costo).toBeNull();
      const { negocios } = await consumoPorNegocio(MES, T, null);
      const deA = negocios.find((n) => n.negocioId === a.negocioId)!;
      expect(deA).toMatchObject({ costo: null, margenCop: null, tokensEntrada: 1_000_000 });
    });

    it('con tarifas calcula el costo de cada negocio y su margen frente al plan', async () => {
      const { negocios } = await consumoPorNegocio(MES, T, TARIFAS_FICTICIAS);
      const deA = negocios.find((n) => n.negocioId === a.negocioId)!;
      // 1 millón de entrada x 1000 + medio millón de salida x 2000; 1,5 minutos x 60; 4 plantillas x 10.
      expect(deA.costo).toEqual({ iaCop: 2000, audioCop: 90, plantillasCop: 40, totalCop: 2130 });
      expect(deA.margenCop).toBe(50000 - 2130);
      const deB = negocios.find((n) => n.negocioId === b.negocioId)!;
      // 7000 x 1000 / 1 millón + 700 x 2000 / 1 millón = 8,4: se redondea al peso.
      expect(deB.costo).toEqual({ iaCop: 8, audioCop: 0, plantillasCop: 10, totalCop: 18 });

      const resumen = await resumenDeConsumo(MES, T, TARIFAS_FICTICIAS);
      expect(resumen.costo).toEqual({ iaCop: 2008, audioCop: 90, plantillasCop: 50, totalCop: 2148 });
    });

    it('un negocio sin plan tiene costo pero no margen', async () => {
      await fijar(b, 'plan_id = NULL', []);
      const d = await consumoDeNegocio(b.negocioId, MES, T, TARIFAS_FICTICIAS);
      expect(d).toMatchObject({ plan: null, porcentajeIa: null, margenCop: null, costo: { totalCop: 18 } });
      await fijar(b, 'plan_id = $2', [planId]);
    });
  });

  describe('alertas', () => {
    const mias = async (ahora = T) => {
      const { alertas } = await resumenDeConsumo(MES, ahora, null);
      const propios = new Set([a.negocioId, b.negocioId]);
      const de = <F extends { negocioId: string }>(lista: F[]) => lista.filter((n) => propios.has(n.negocioId));
      return { cercaDelLimite: de(alertas.cercaDelLimite), pruebasPorVencer: de(alertas.pruebasPorVencer), sinCitas: de(alertas.sinCitas) };
    };

    it('avisa de los negocios al 80% o más de su plan', async () => {
      // A lleva 8 de 10 y B 7 de 10.
      expect((await mias()).cercaDelLimite).toEqual([
        { negocioId: a.negocioId, nombre: 'Consumo A', plan: expect.any(String), conversacionesIa: 8, limite: 10, porcentaje: 80 },
      ]);
    });

    it('avisa de las pruebas que vencen en 5 días o ya vencieron, no de las que vencen después', async () => {
      await fijar(a, 'prueba_hasta = $2', [dias(4)]);
      await fijar(b, 'prueba_hasta = $2', [dias(6)]);
      expect((await mias()).pruebasPorVencer).toEqual([{ negocioId: a.negocioId, nombre: 'Consumo A', pruebaHasta: dias(4) }]);

      await fijar(b, 'prueba_hasta = $2', [dias(-1)]);
      expect((await mias()).pruebasPorVencer.map((n) => n.negocioId).sort()).toEqual([a.negocioId, b.negocioId].sort());

      // Un negocio activo ya no está en prueba, aunque le quede la fecha.
      await fijar(a, `estado = 'activo'`, []);
      expect((await mias()).pruebasPorVencer.map((n) => n.negocioId)).toEqual([b.negocioId]);
      await fijar(a, `estado = 'prueba'`, []);
    });

    it('avisa de los negocios sin citas nuevas en 14 días, salvo los creados hace menos de 14', async () => {
      const ultima = (n: NegocioDePrueba, cuando: Date) => sistema('UPDATE citas SET created_at = $2 WHERE negocio_id = $1', [n.negocioId, cuando]);

      // A se creó hace un mes y su última cita es de hace 2 días; B hace 15 días y nunca tuvo citas.
      await fijar(a, 'created_at = $2', [dias(-30)]);
      await fijar(b, 'created_at = $2', [dias(-15)]);
      await ultima(a, dias(-2));
      expect((await mias()).sinCitas).toEqual([{ negocioId: b.negocioId, nombre: 'Consumo B', ultimaCitaCreada: null }]);

      // B creado hace 13 días: todavía no tuvo sus 14 días.
      await fijar(b, 'created_at = $2', [dias(-13)]);
      expect((await mias()).sinCitas).toEqual([]);

      // La última cita de A pasa a ser de hace 15 días.
      await ultima(a, dias(-15));
      expect((await mias()).sinCitas).toEqual([{ negocioId: a.negocioId, nombre: 'Consumo A', ultimaCitaCreada: dias(-15) }]);
    });

    it('un negocio suspendido no genera alertas', async () => {
      await fijar(a, `estado = 'suspendido'`, []);
      const alertas = await mias();
      expect([...alertas.cercaDelLimite, ...alertas.pruebasPorVencer, ...alertas.sinCitas].filter((n) => n.negocioId === a.negocioId)).toEqual([]);
      await fijar(a, `estado = 'prueba'`, []);
    });
  });

  it('ninguna respuesta lleva mensajes, teléfonos ni nombres de clientes', async () => {
    for (const ruta of rutas()) {
      const texto = await (await pedir(`${ruta}?mes=${MES}`, tokens.superadmin)).text();
      for (const secreto of Object.values(SECRETOS)) expect(texto, `${ruta}: ${secreto}`).not.toContain(secreto);
    }
  });
});
