import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { crearAtender, TEXTO_LIMITE_DEL_PLAN } from '../src/modulos/ia/ia.servicio.js';
import { reservarConversacionIA } from '../src/modulos/uso/uso.servicio.js';
import { registrarCuenta } from '../src/modulos/whatsapp/whatsapp.cuentas.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

/** Viernes 16 de marzo de 2035, 9:00 a. m. en Bogotá. */
const T = new Date('2035-03-16T14:00:00Z');
const MARZO = '2035-03-01';

describe('uso del plan: conversaciones de IA y tokens', () => {
  const planes: string[] = [];
  let telefonos = 0;

  interface Escena {
    n: NegocioDePrueba;
    cuentaId: string;
  }

  /** Un negocio propio por prueba: los contadores no se mezclan. */
  async function escena(maxConversaciones: number | null = null): Promise<Escena> {
    const n = await crearNegocio('Negocio de uso');
    const cuenta = await registrarCuenta(n.negocioId, {
      phoneNumberId: `${Date.now()}${++telefonos}`,
      wabaId: '1',
      numeroVisible: '3000000001',
      token: 'EAAtoken-de-prueba-uso',
    });
    if (maxConversaciones !== null) {
      const { rows } = await conSistema((tx) =>
        tx.consultar<{ id: string }>(
          'INSERT INTO planes (nombre, precio_mensual_cop, max_conversaciones_ia_mes) VALUES ($1, 50000, $2) RETURNING id',
          [`Plan ${randomUUID()}`, maxConversaciones],
        ),
      );
      planes.push(rows[0]!.id);
      await conSistema((tx) => tx.consultar('UPDATE negocios SET plan_id = $2 WHERE id = $1', [n.negocioId, rows[0]!.id]));
    }
    return { n, cuentaId: cuenta.id };
  }

  async function conversacion({ n, cuentaId }: Escena, momento = T): Promise<{ conversacionId: string; clienteId: string }> {
    return conNegocio(n.negocioId, async (tx) => {
      const cliente = await tx.consultar<{ id: string }>(
        'INSERT INTO clientes (negocio_id, telefono) VALUES ($1, $2) RETURNING id',
        [n.negocioId, `5736${String(++telefonos).padStart(8, '0')}`],
      );
      const clienteId = cliente.rows[0]!.id;
      const { rows } = await tx.consultar<{ id: string }>(
        'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4) RETURNING id',
        [n.negocioId, clienteId, cuentaId, momento],
      );
      await tx.consultar(
        `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo, contenido, creado_en)
         VALUES ($1, $2, 'entrante', 'cliente', 'texto', 'Hola', $3)`,
        [n.negocioId, rows[0]!.id, momento],
      );
      return { conversacionId: rows[0]!.id, clienteId };
    });
  }

  /** Modelo simulado que responde texto con un uso de tokens fijo. */
  const modelo = (entrada = 1000, salida = 50) =>
    vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hola' }] }],
          usage: { input_tokens: entrada, output_tokens: salida },
        }),
        { status: 200 },
      ),
    );
  const meta = () =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 }));

  const atender = (e: Escena, c: { conversacionId: string; clienteId: string }, opciones: { pedir?: typeof fetch; envio?: typeof fetch; ahora?: Date } = {}) =>
    crearAtender({
      modelo: { pedir: opciones.pedir ?? modelo(), clave: () => 'sk-prueba' },
      envio: { pedir: opciones.envio ?? meta() },
      reloj: () => opciones.ahora ?? T,
    })({ negocioId: e.n.negocioId, ...c });

  const uso = async (e: Escena) =>
    (
      await conNegocio(e.n.negocioId, (tx) =>
        tx.consultar<{ periodo: string; conversaciones_ia: number; tokens_entrada: string; tokens_salida: string }>(
          `SELECT to_char(periodo, 'YYYY-MM-DD') AS periodo, conversaciones_ia, tokens_entrada, tokens_salida
             FROM uso_mensual ORDER BY periodo`,
        ),
      )
    ).rows.map((f) => ({ ...f, tokens_entrada: Number(f.tokens_entrada), tokens_salida: Number(f.tokens_salida) }));

  const sql = async <F extends object>(e: Escena, texto: string, params: unknown[]) =>
    (await conNegocio(e.n.negocioId, (tx) => tx.consultar<F>(texto, params))).rows;

  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM planes WHERE id = ANY($1::uuid[])', [planes]));
  });

  describe('conversaciones de IA', () => {
    it('cuenta una conversación una sola vez al mes, por más mensajes que tenga', async () => {
      const e = await escena();
      const c = await conversacion(e);
      await atender(e, c);
      await atender(e, c);
      await atender(e, c, { ahora: new Date(T.getTime() + 3_600_000) });
      expect((await uso(e)).map((u) => [u.periodo, u.conversaciones_ia])).toEqual([[MARZO, 1]]);
      const [conv] = await sql<{ periodo: string }>(e, `SELECT to_char(ia_contada_periodo, 'YYYY-MM-DD') AS periodo FROM conversaciones WHERE id = $1`, [c.conversacionId]);
      expect(conv!.periodo).toBe(MARZO);
    });

    it('la misma conversación vuelve a contar en el mes siguiente', async () => {
      const e = await escena();
      const c = await conversacion(e);
      await atender(e, c);
      const abril = new Date('2035-04-02T14:00:00Z');
      await sql(e, 'UPDATE conversaciones SET ultimo_mensaje_cliente_en = $2 WHERE id = $1', [c.conversacionId, abril]);
      await atender(e, c, { ahora: abril });
      expect((await uso(e)).map((u) => [u.periodo, u.conversaciones_ia])).toEqual([[MARZO, 1], ['2035-04-01', 1]]);
    });

    it('el mes es el del negocio, no el de UTC', async () => {
      const e = await escena();
      // 1 de abril a las 3:00 UTC todavía es 31 de marzo a las 10:00 p. m. en Bogotá.
      const borde = new Date('2035-04-01T03:00:00Z');
      const c = await conversacion(e, borde);
      await atender(e, c, { ahora: borde });
      expect((await uso(e)).map((u) => u.periodo)).toEqual([MARZO]);
    });
  });

  describe('tokens', () => {
    it('suma los tokens de entrada y salida de cada atención en el mes', async () => {
      const e = await escena();
      const c = await conversacion(e);
      await atender(e, c, { pedir: modelo(1200, 80) });
      await atender(e, c, { pedir: modelo(800, 20) });
      expect(await uso(e)).toMatchObject([{ periodo: MARZO, tokens_entrada: 2000, tokens_salida: 100 }]);
    });

    it('anota los tokens aunque la atención falle', async () => {
      const e = await escena();
      const c = await conversacion(e);
      const vacio = vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ status: 'completed', output: [], usage: { input_tokens: 500, output_tokens: 7 } }), { status: 200 }),
      );
      await expect(atender(e, c, { pedir: vacio })).rejects.toThrow();
      expect(await uso(e)).toMatchObject([{ tokens_entrada: 500, tokens_salida: 7 }]);
    });
  });

  it('la migración 016 deja cargados los tres planes', async () => {
    const { rows } = await conSistema((tx) =>
      tx.consultar(
        `SELECT nombre, precio_mensual_cop, max_profesionales, max_conversaciones_ia_mes, max_citas_mes, activo
           FROM planes WHERE nombre IN ('Independiente', 'Barbería', 'Pro') ORDER BY precio_mensual_cop`,
      ),
    );
    expect(rows).toEqual([
      { nombre: 'Independiente', precio_mensual_cop: 39900, max_profesionales: 1, max_conversaciones_ia_mes: 300, max_citas_mes: null, activo: true },
      { nombre: 'Barbería', precio_mensual_cop: 89900, max_profesionales: 4, max_conversaciones_ia_mes: 1000, max_citas_mes: null, activo: true },
      { nombre: 'Pro', precio_mensual_cop: 149900, max_profesionales: 10, max_conversaciones_ia_mes: 2500, max_citas_mes: null, activo: true },
    ]);
  });

  describe('límite del plan', () => {
    it('al llegar al límite, una conversación nueva no pasa por la IA: se deriva y se avisa al cliente', async () => {
      const e = await escena(1);
      const primera = await conversacion(e);
      await atender(e, primera);

      const segunda = await conversacion(e);
      const pedir = modelo();
      const envio = meta();
      await atender(e, segunda, { pedir, envio });
      expect(pedir).not.toHaveBeenCalled();
      expect(JSON.parse(String(envio.mock.calls[0]![1]!.body)).text.body).toBe(TEXTO_LIMITE_DEL_PLAN);
      expect(await sql(e, 'SELECT motivo FROM derivaciones WHERE conversacion_id = $1', [segunda.conversacionId])).toEqual([{ motivo: 'limite_plan' }]);
      expect(await sql(e, 'SELECT estado FROM conversaciones WHERE id = $1', [segunda.conversacionId])).toEqual([{ estado: 'humano' }]);
      expect(await sql(e, `SELECT emisor FROM mensajes WHERE conversacion_id = $1 AND direccion = 'saliente'`, [segunda.conversacionId])).toEqual([{ emisor: 'sistema' }]);
      // No se contó ni se gastaron tokens.
      expect(await uso(e)).toMatchObject([{ conversaciones_ia: 1, tokens_entrada: 1000 }]);
    });

    it('la conversación que ya se contó sigue atendida aunque el plan esté lleno', async () => {
      const e = await escena(1);
      const primera = await conversacion(e);
      await atender(e, primera);
      await atender(e, await conversacion(e));
      const pedir = modelo();
      await atender(e, primera, { pedir });
      expect(pedir).toHaveBeenCalled();
    });

    it('sin plan no hay límite', async () => {
      const e = await escena();
      for (let i = 0; i < 3; i += 1) await atender(e, await conversacion(e));
      expect((await uso(e))[0]!.conversaciones_ia).toBe(3);
      expect(await sql(e, 'SELECT 1 FROM derivaciones', [])).toEqual([]);
    });

    it('dos conversaciones nuevas a la vez con un solo cupo: entra una', async () => {
      const e = await escena(1);
      const conversaciones = await Promise.all([conversacion(e), conversacion(e), conversacion(e)]);
      const resultados = await Promise.all(
        conversaciones.map((c) => reservarConversacionIA(e.n.negocioId, c.conversacionId, 'America/Bogota', T)),
      );
      expect(resultados.sort()).toEqual(['contada', 'sin_cupo', 'sin_cupo']);
      expect((await uso(e))[0]!.conversaciones_ia).toBe(1);
    });

    it('la misma conversación reservada a la vez cuenta una sola vez', async () => {
      const e = await escena();
      const c = await conversacion(e);
      const resultados = await Promise.all(
        Array.from({ length: 4 }, () => reservarConversacionIA(e.n.negocioId, c.conversacionId, 'America/Bogota', T)),
      );
      expect(resultados.sort()).toEqual(['contada', 'ya_contada', 'ya_contada', 'ya_contada']);
      expect((await uso(e))[0]!.conversaciones_ia).toBe(1);
    });

    it('si el aviso del límite no se puede enviar, la conversación igual queda derivada', async () => {
      const e = await escena(1);
      await atender(e, await conversacion(e));
      const segunda = await conversacion(e);
      // Ventana de 24 h cerrada: enviarMensaje lanza.
      await sql(e, 'UPDATE conversaciones SET ultimo_mensaje_cliente_en = $2 WHERE id = $1', [segunda.conversacionId, new Date(T.getTime() - 2 * 86_400_000)]);
      await expect(atender(e, segunda)).resolves.toBeUndefined();
      expect(await sql(e, 'SELECT estado FROM conversaciones WHERE id = $1', [segunda.conversacionId])).toEqual([{ estado: 'humano' }]);
    });
  });
});
