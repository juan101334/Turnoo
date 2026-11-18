import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { primerDiaDelMes } from '../src/compartido/tiempo.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { consumoDeNegocio, consumoPorNegocio, mensajesDeServicio, resumenDeConsumo, type Tarifas } from '../src/modulos/uso/consumo.servicio.js';
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
/** FICTICIA: 1 peso por mensaje de utilidad y lo demás en 0, para leer el costo como un conteo. */
const TARIFA_FICTICIA_DE_UNO: Tarifas = { iaEntradaCopMillon: 0, iaSalidaCopMillon: 0, audioCopMinuto: 0, plantillaUtilidadCop: 1 };
/** Lo que Meta da gratis hoy por número; en las pruebas se pasa explícito. */
const GRATIS = 1000;

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
        // El único saliente de A en mayo falló: no cuenta.
        mensajesServicio: { total: 0, gratis: 0, cobrados: 0 },
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
      expect(deA.costo).toEqual({ iaCop: 2000, audioCop: 90, plantillasCop: 40, servicioCop: 0, totalCop: 2130 });
      expect(deA.margenCop).toBe(50000 - 2130);
      const deB = negocios.find((n) => n.negocioId === b.negocioId)!;
      // 7000 x 1000 / 1 millón + 700 x 2000 / 1 millón = 8,4: se redondea al peso.
      expect(deB.costo).toEqual({ iaCop: 8, audioCop: 0, plantillasCop: 10, servicioCop: 0, totalCop: 18 });

      const resumen = await resumenDeConsumo(MES, T, TARIFAS_FICTICIAS);
      expect(resumen.costo).toEqual({ iaCop: 2008, audioCop: 90, plantillasCop: 50, servicioCop: 0, totalCop: 2148 });
    });

    it('un negocio sin plan tiene costo pero no margen', async () => {
      await fijar(b, 'plan_id = NULL', []);
      const d = await consumoDeNegocio(b.negocioId, MES, T, TARIFAS_FICTICIAS);
      expect(d).toMatchObject({ plan: null, porcentajeIa: null, margenCop: null, costo: { totalCop: 18 } });
      await fijar(b, 'plan_id = $2', [planId]);
    });
  });

  describe('mensajes de servicio', () => {
    /** Agosto de 2036 en Bogotá: un mes que ninguna otra prueba usa. */
    const AGOSTO = '2036-08';
    const T_AGOSTO = new Date('2036-08-16T14:00:00Z');
    let c: NegocioDePrueba;
    let d: NegocioDePrueba;
    /** Conversación de C por cada número, y una de D. */
    const conv = {} as Record<'cX' | 'cY' | 'd', string>;

    async function conversacion(n: NegocioDePrueba, telefonoDelNumero: string): Promise<string> {
      const cuenta = await registrarCuenta(n.negocioId, { phoneNumberId: `${Date.now()}${telefonoDelNumero}`, wabaId: '1', numeroVisible: telefonoDelNumero, token: 'EAAtoken-de-prueba-servicio' });
      const cliente = await crearCliente(n, 'Cliente de prueba');
      const [fila] = await sistema<{ id: string }>(
        'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id) VALUES ($1, $2, $3) RETURNING id',
        [n.negocioId, cliente, cuenta.id],
      );
      return fila!.id;
    }

    /** `cantidad` mensajes iguales en una conversación. */
    const mensajes = (n: NegocioDePrueba, conversacionId: string, cantidad: number, cuando: Date, otros: { estado?: string | null; direccion?: string; emisor?: string; tipo?: string } = {}) =>
      sistema(
        `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, estado_entrega, creado_en)
         SELECT $1, $2, $3, $4, $5, 'texto de prueba', $6, $7 FROM generate_series(1, $8::int)`,
        [n.negocioId, conversacionId, otros.direccion ?? 'saliente', otros.emisor ?? 'ia', otros.tipo ?? 'texto', otros.estado === undefined ? 'enviado' : otros.estado, cuando, cantidad],
      );

    const deC = () => consumoDeNegocio(c.negocioId, AGOSTO, T_AGOSTO, TARIFA_FICTICIA_DE_UNO, GRATIS);

    beforeAll(async () => {
      c = await crearNegocio('Servicio C');
      d = await crearNegocio('Servicio D');
      conv.cX = await conversacion(c, '3000000101');
      conv.cY = await conversacion(c, '3000000102');
      conv.d = await conversacion(d, '3000000201');
    });

    it('la cuenta de gratis y cobrados va número por número', () => {
      expect(mensajesDeServicio([], GRATIS)).toEqual({ total: 0, gratis: 0, cobrados: 0 });
      expect(mensajesDeServicio([1000], GRATIS)).toEqual({ total: 1000, gratis: 1000, cobrados: 0 });
      expect(mensajesDeServicio([1001], GRATIS)).toEqual({ total: 1001, gratis: 1000, cobrados: 1 });
      // Lo que un número no usó no cubre al otro.
      expect(mensajesDeServicio([1001, 500], GRATIS)).toEqual({ total: 1501, gratis: 1500, cobrados: 1 });
      expect(mensajesDeServicio([10], 0)).toEqual({ total: 10, gratis: 0, cobrados: 10 });
    });

    it('1.000 mensajes en un número cuestan 0; el 1.001 cuesta 1 (tarifa ficticia de 1)', async () => {
      // Asistente, panel y sistema cuentan igual: todos son texto libre por la API.
      await mensajes(c, conv.cX, 998, T_AGOSTO);
      await mensajes(c, conv.cX, 1, T_AGOSTO, { emisor: 'humano' });
      await mensajes(c, conv.cX, 1, T_AGOSTO, { emisor: 'sistema' });
      let detalle = await deC();
      expect(detalle.mensajesServicio).toEqual({ total: 1000, gratis: 1000, cobrados: 0 });
      expect(detalle.costo).toMatchObject({ servicioCop: 0, totalCop: 0 });

      await mensajes(c, conv.cX, 1, T_AGOSTO);
      detalle = await deC();
      expect(detalle.mensajesServicio).toEqual({ total: 1001, gratis: 1000, cobrados: 1 });
      expect(detalle.costo).toMatchObject({ servicioCop: 1, totalCop: 1 });
      // C no tiene plan: sin margen (con plan, ver la última prueba).
      expect(detalle.margenCop).toBeNull();
    });

    it('no cuentan los fallidos, los que no se supo si salieron, los entrantes ni las plantillas', async () => {
      const antes = (await deC()).mensajesServicio.total;
      await mensajes(c, conv.cX, 40, T_AGOSTO, { estado: 'fallido' });
      await mensajes(c, conv.cX, 3, T_AGOSTO, { estado: null });
      await mensajes(c, conv.cX, 7, T_AGOSTO, { direccion: 'entrante', emisor: 'cliente', estado: null });
      await mensajes(c, conv.cX, 2, T_AGOSTO, { tipo: 'plantilla' });
      expect((await deC()).mensajesServicio.total).toBe(antes);
      // Si algún día se registra la entrega, 'entregado' y 'leido' siguen contando.
      await mensajes(c, conv.cY, 1, T_AGOSTO, { estado: 'entregado' });
      await mensajes(c, conv.cY, 1, T_AGOSTO, { estado: 'leido' });
      expect((await deC()).mensajesServicio.total).toBe(antes + 2);
    });

    it('cada número tiene sus 1.000 gratis', async () => {
      // cX va en 1.001 y cY en 2 (prueba anterior): 498 más en cY siguen siendo gratis.
      await mensajes(c, conv.cY, 498, T_AGOSTO);
      const detalle = await deC();
      expect(detalle.mensajesServicio).toEqual({ total: 1501, gratis: 1500, cobrados: 1 });
      expect(detalle.costo?.servicioCop).toBe(1);
    });

    it('el mes es el del negocio en Bogotá, también en los bordes', async () => {
      // 1 de agosto a las 4:59 UTC = 31 de julio, 11:59 p. m. en Bogotá: es de julio.
      await mensajes(c, conv.cY, 5, new Date('2036-08-01T04:59:00Z'));
      // 1 de septiembre a las 3:00 UTC = 31 de agosto, 10:00 p. m. en Bogotá: es de agosto.
      await mensajes(c, conv.cY, 2, new Date('2036-09-01T03:00:00Z'));
      // 1 de septiembre a las 5:00 UTC = medianoche en Bogotá: ya es de septiembre.
      await mensajes(c, conv.cY, 4, new Date('2036-09-01T05:00:00Z'));
      expect((await deC()).mensajesServicio.total).toBe(1503);
      expect((await consumoDeNegocio(c.negocioId, '2036-07', T_AGOSTO, null, GRATIS)).mensajesServicio.total).toBe(5);
      expect((await consumoDeNegocio(c.negocioId, '2036-09', T_AGOSTO, null, GRATIS)).mensajesServicio.total).toBe(4);
    });

    it('el conteo de un negocio no incluye los mensajes de otro', async () => {
      await mensajes(d, conv.d, 6, T_AGOSTO);
      const { negocios } = await consumoPorNegocio(AGOSTO, T_AGOSTO, TARIFA_FICTICIA_DE_UNO, GRATIS);
      expect(negocios.find((n) => n.negocioId === d.negocioId)!.mensajesServicio).toEqual({ total: 6, gratis: 6, cobrados: 0 });
      expect(negocios.find((n) => n.negocioId === c.negocioId)!.mensajesServicio.total).toBe(1503);
    });

    it('el resumen suma lo de cada negocio, y el costo del servicio entra en el total', async () => {
      const resumen = await resumenDeConsumo(AGOSTO, T_AGOSTO, TARIFA_FICTICIA_DE_UNO, GRATIS);
      // En agosto de 2036 solo hay mensajes de C (cX 1.001, cY 502) y de D (6): solo 1 se cobra.
      expect(resumen.uso.mensajesServicio).toEqual({ total: 1509, gratis: 1508, cobrados: 1 });
      expect(resumen.costo).toMatchObject({ servicioCop: 1, totalCop: 1 });
    });

    it('sin tarifas se ven los mensajes pero no hay costo', async () => {
      const detalle = await consumoDeNegocio(c.negocioId, AGOSTO, T_AGOSTO, null, GRATIS);
      expect(detalle.mensajesServicio.cobrados).toBe(1);
      expect(detalle.costo).toBeNull();
    });

    it('con un plan, el costo del servicio baja el margen', async () => {
      await fijar(c, 'plan_id = $2', [planId]);
      const detalle = await deC();
      expect(detalle.margenCop).toBe(50000 - 1);
      await fijar(c, 'plan_id = NULL', []);
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
