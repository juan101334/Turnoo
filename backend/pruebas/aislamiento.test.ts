import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { pool } from '../src/db/pool.js';
import { buscarCuentaWhatsapp, usuarioParaLogin } from '../src/db/previas.js';
import {
  crearCliente,
  crearNegocio,
  crearProfesional,
  hora,
  limpiar,
  type NegocioDePrueba,
} from './ayudas.js';

describe('aislamiento entre negocios', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let profesionalA: string;
  let clienteA: string;
  let clienteB: string;

  beforeAll(async () => {
    a = await crearNegocio('Negocio A');
    b = await crearNegocio('Negocio B');
    profesionalA = await crearProfesional(a);
    clienteA = await crearCliente(a);
    clienteB = await crearCliente(b);
  });
  afterAll(limpiar);

  it('un negocio solo ve sus propios clientes', async () => {
    const vistosPorA = await conNegocio(a.negocioId, async (tx) =>
      (await tx.consultar<{ id: string }>('SELECT id FROM clientes')).rows.map((f) => f.id),
    );
    const vistosPorB = await conNegocio(b.negocioId, async (tx) =>
      (await tx.consultar<{ id: string }>('SELECT id FROM clientes')).rows.map((f) => f.id),
    );
    expect(vistosPorA).toEqual([clienteA]);
    expect(vistosPorB).toEqual([clienteB]);
  });

  it('un negocio solo ve su propia fila en la tabla de negocios', async () => {
    const ids = await conNegocio(b.negocioId, async (tx) =>
      (await tx.consultar<{ id: string }>('SELECT id FROM negocios')).rows.map((f) => f.id),
    );
    expect(ids).toEqual([b.negocioId]);
  });

  it('no puede insertar filas a nombre de otro negocio', async () => {
    await expect(
      conNegocio(b.negocioId, (tx) =>
        tx.consultar('INSERT INTO clientes (negocio_id, telefono) VALUES ($1, $2)', [
          a.negocioId,
          '573000000001',
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' }); // viola la política de seguridad por filas
  });

  it('no puede modificar ni borrar filas de otro negocio', async () => {
    const modificadas = await conNegocio(b.negocioId, (tx) =>
      tx.consultar("UPDATE clientes SET nombre = 'hackeado' WHERE id = $1", [clienteA]),
    );
    const borradas = await conNegocio(b.negocioId, (tx) =>
      tx.consultar('DELETE FROM clientes WHERE id = $1', [clienteA]),
    );
    expect(modificadas.rowCount).toBe(0);
    expect(borradas.rowCount).toBe(0);

    const nombre = await conNegocio(a.negocioId, async (tx) =>
      (await tx.consultar<{ nombre: string }>('SELECT nombre FROM clientes WHERE id = $1', [clienteA]))
        .rows[0]?.nombre,
    );
    expect(nombre).toBe('Cliente');
  });

  it('sin indicar un negocio no se ve ninguna fila', async () => {
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM clientes');
    expect(rows[0]?.n).toBe(0);
  });

  it('las claves foráneas impiden mezclar datos de dos negocios', async () => {
    // Aun saltándose el RLS (conSistema), la base rechaza una cita del negocio B
    // que apunte a un barbero del negocio A.
    await expect(
      conSistema((tx) =>
        tx.consultar(
          `INSERT INTO citas (negocio_id, sede_id, profesional_id, cliente_id, inicio, fin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [b.negocioId, b.sedeId, profesionalA, clienteB, hora('10:00'), hora('10:30')],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('conSistema ve los datos de todos los negocios', async () => {
    const ids = await conSistema(async (tx) =>
      (await tx.consultar<{ id: string }>('SELECT id FROM negocios')).rows.map((f) => f.id),
    );
    expect(ids).toEqual(expect.arrayContaining([a.negocioId, b.negocioId]));
  });

  it('conNegocio rechaza un id que no es un uuid', () => {
    expect(() => conNegocio('esto-no-es-un-uuid', async () => 1)).toThrow('uuid');
  });
});

describe('consultas previas al contexto', () => {
  let n: NegocioDePrueba;
  const phoneNumberId = `pn-${randomUUID()}`;
  const email = `dueno-${randomUUID()}@prueba.com`;

  beforeAll(async () => {
    n = await crearNegocio('Negocio con cuenta');
    await conNegocio(n.negocioId, async (tx) => {
      await tx.consultar(
        `INSERT INTO whatsapp_cuentas (negocio_id, phone_number_id, waba_id, numero_visible, token_acceso_cifrado)
         VALUES ($1, $2, 'waba', '573100000000', 'token-cifrado')`,
        [n.negocioId, phoneNumberId],
      );
      await tx.consultar(
        `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo)
         VALUES ($1, $2, 'Dueño', 'dueno', true)`,
        [n.negocioId, email],
      );
    });
  });
  afterAll(limpiar);

  it('encuentra el negocio al que pertenece un número de WhatsApp', async () => {
    const cuenta = await buscarCuentaWhatsapp(phoneNumberId);
    expect(cuenta?.negocioId).toBe(n.negocioId);
    expect(cuenta?.estadoNegocio).toBe('prueba');
  });

  it('devuelve null si el número de WhatsApp no existe', async () => {
    expect(await buscarCuentaWhatsapp('numero-que-no-existe')).toBeNull();
  });

  it('encuentra al usuario por correo sin importar las mayúsculas', async () => {
    const usuario = await usuarioParaLogin(email.toUpperCase());
    expect(usuario?.negocioId).toBe(n.negocioId);
    expect(usuario?.rol).toBe('dueno');
  });

  it('devuelve null si el correo no existe', async () => {
    expect(await usuarioParaLogin('nadie@prueba.com')).toBeNull();
  });
});
