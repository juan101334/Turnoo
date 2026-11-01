import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Duplicado } from '../src/compartido/errores.js';
import { conNegocio } from '../src/db/contexto.js';
import { crearCliente, crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

describe('conversaciones y mensajes', () => {
  let n: NegocioDePrueba;
  let conversacionId: string;

  beforeAll(async () => {
    n = await crearNegocio();
    const clienteId = await crearCliente(n);
    const cuentaId = randomUUID();
    conversacionId = randomUUID();
    await conNegocio(n.negocioId, async (tx) => {
      await tx.consultar(
        `INSERT INTO whatsapp_cuentas (id, negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
         VALUES ($1, $2, $3, 'waba', '573100000000', 'token')`,
        [cuentaId, n.negocioId, `pn-${randomUUID()}`],
      );
      await tx.consultar(
        'INSERT INTO conversaciones (id, negocio_id, cliente_id, whatsapp_cuenta_id) VALUES ($1, $2, $3, $4)',
        [conversacionId, n.negocioId, clienteId, cuentaId],
      );
    });
  });
  afterAll(limpiar);

  const guardarEntrante = (waMessageId: string, conflicto = '') =>
    conNegocio(n.negocioId, (tx) =>
      tx.consultar(
        `INSERT INTO mensajes (negocio_id, conversacion_id, wa_message_id, direccion, emisor, tipo, contenido)
         VALUES ($1, $2, $3, 'entrante', 'cliente', 'texto', 'hola') ${conflicto}`,
        [n.negocioId, conversacionId, waMessageId],
      ),
    );

  it('ignora un mensaje que Meta reenvía (mismo wa_message_id)', async () => {
    const id = `wamid.${randomUUID()}`;
    const primero = await guardarEntrante(id, 'ON CONFLICT (wa_message_id) DO NOTHING');
    const repetido = await guardarEntrante(id, 'ON CONFLICT (wa_message_id) DO NOTHING');
    expect(primero.rowCount).toBe(1);
    expect(repetido.rowCount).toBe(0);
  });

  it('sin ON CONFLICT, un mensaje repetido falla como duplicado', async () => {
    const id = `wamid.${randomUUID()}`;
    await guardarEntrante(id);
    await expect(guardarEntrante(id)).rejects.toBeInstanceOf(Duplicado);
  });

  it('un mensaje entrante debe venir del cliente', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo)
           VALUES ($1, $2, 'entrante', 'ia', 'texto')`,
          [n.negocioId, conversacionId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('un mensaje saliente no puede venir del cliente', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO mensajes (negocio_id, conversacion_id, direccion, emisor, tipo)
           VALUES ($1, $2, 'saliente', 'cliente', 'texto')`,
          [n.negocioId, conversacionId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('una conversación en modo humano necesita la fecha de la derivación', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar("UPDATE conversaciones SET estado = 'humano' WHERE id = $1", [conversacionId]),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar("UPDATE conversaciones SET estado = 'humano', humano_desde = now() WHERE id = $1", [
          conversacionId,
        ]),
      ),
    ).resolves.toBeDefined();
  });
});
