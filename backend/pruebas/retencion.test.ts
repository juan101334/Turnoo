import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entorno } from '../src/config/entorno.js';
import { conNegocio } from '../src/db/contexto.js';
import { guardarArchivo, rutaDeImagen } from '../src/modulos/adjuntos/adjuntos.archivos.js';
import { borrarImagenesVencidas } from '../src/tareas/tareas.js';
import { crearCita, crearCliente, crearNegocio, crearProfesional, limpiar, type NegocioDePrueba } from './ayudas.js';

const AHORA = new Date('2036-01-10T12:00:00Z');
const DIA = 86_400_000;
const BASE = resolve(entorno.ARCHIVOS_DIR);
const existe = (ruta: string) => stat(join(BASE, ruta)).then(() => true, () => false);

describe('retención de las imágenes de los clientes', () => {
  let n: NegocioDePrueba;
  let conversacionId: string;
  let clienteId: string;
  let barbero: string;

  const sql = async <F extends object>(texto: string, params: unknown[] = []) =>
    (await conNegocio(n.negocioId, (tx) => tx.consultar<F>(texto, params))).rows;

  /** Una imagen guardada en disco y en la base, que llegó hace `dias` días. */
  async function imagen(dias: number, citaId: string | null = null) {
    const id = randomUUID();
    const ruta = rutaDeImagen(n.negocioId, id, 'jpg');
    await guardarArchivo(ruta, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await sql(
      `INSERT INTO mensajes (id, negocio_id, conversacion_id, direccion, emisor, tipo, media_id, archivo_ruta, cita_id, creado_en)
       VALUES ($1, $2, $3, 'entrante', 'cliente', 'imagen', $4, $5, $6, $7)`,
      [id, n.negocioId, conversacionId, `media-${id}`, ruta, citaId, new Date(AHORA.getTime() - dias * DIA)],
    );
    return { id, ruta };
  }
  const fila = async (id: string) =>
    (await sql<{ archivo_ruta: string | null; cita_id: string | null; media_id: string | null }>('SELECT archivo_ruta, cita_id, media_id FROM mensajes WHERE id = $1', [id]))[0]!;

  beforeAll(async () => {
    n = await crearNegocio('Retención');
    barbero = await crearProfesional(n);
    clienteId = await crearCliente(n);
    const [cuenta] = await sql<{ id: string }>(
      `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
       VALUES ($1, $2, 'waba', '573000000000', 'sin-uso-en-pruebas') RETURNING id`,
      [n.negocioId, randomUUID()],
    );
    const [c] = await sql<{ id: string }>(
      'INSERT INTO conversaciones (negocio_id, cliente_id, whatsapp_cuenta_id, ultimo_mensaje_cliente_en) VALUES ($1, $2, $3, $4) RETURNING id',
      [n.negocioId, clienteId, cuenta!.id, AHORA],
    );
    conversacionId = c!.id;
  });
  afterAll(limpiar);

  it('borra del disco las que cumplieron los días y deja el mensaje sin archivo, sin cita y sin el id de Meta', async () => {
    const cita = await crearCita(n, { profesionalId: barbero, clienteId, inicio: new Date(AHORA.getTime() - 200 * DIA), fin: new Date(AHORA.getTime() - 200 * DIA + 1_800_000) });
    const vieja = await imagen(181);
    const viejaConCita = await imagen(200, cita);
    const reciente = await imagen(10);

    const borradas = await borrarImagenesVencidas(AHORA, 180);
    expect(borradas).toBeGreaterThanOrEqual(2);

    for (const { id, ruta } of [vieja, viejaConCita]) {
      expect(await existe(ruta)).toBe(false);
      expect(await fila(id)).toEqual({ archivo_ruta: null, cita_id: null, media_id: null });
    }
    // La cita sigue; solo ya no tiene la imagen.
    expect(await sql('SELECT 1 FROM citas WHERE id = $1', [cita])).toHaveLength(1);
    expect(await existe(reciente.ruta)).toBe(true);
    expect((await fila(reciente.id)).archivo_ruta).toBe(reciente.ruta);
  });

  it('con 0 días no borra nada', async () => {
    const vieja = await imagen(5000);
    expect(await borrarImagenesVencidas(AHORA, 0)).toBe(0);
    expect(await existe(vieja.ruta)).toBe(true);
    expect((await fila(vieja.id)).archivo_ruta).toBe(vieja.ruta);
  });
});
