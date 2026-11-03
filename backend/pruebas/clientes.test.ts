import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatosInvalidos } from '../src/compartido/errores.js';
import { conNegocio } from '../src/db/contexto.js';
import { normalizarTelefono, obtenerOCrearCliente } from '../src/modulos/clientes/clientes.servicio.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

describe('normalizarTelefono', () => {
  it('deja solo dígitos y agrega el 57 a un celular colombiano de 10 dígitos', () => {
    for (const entrada of ['3001234567', '300 123 4567', '(300) 123-4567', '+57 300 123 4567', '573001234567']) {
      expect(normalizarTelefono(entrada)).toBe('573001234567');
    }
  });

  it('respeta otros indicativos', () => {
    expect(normalizarTelefono('+1 (415) 555-2671')).toBe('14155552671');
  });

  it('rechaza lo que no es un teléfono', () => {
    for (const mala of ['', 'abc', '123', '1234567890123456', '300-123-45a7', 5, null, undefined]) {
      expect(() => normalizarTelefono(mala)).toThrow(DatosInvalidos);
    }
  });
});

describe('obtenerOCrearCliente', () => {
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  beforeAll(async () => {
    a = await crearNegocio('A');
    b = await crearNegocio('B');
  });
  afterAll(limpiar);

  const contar = (n: NegocioDePrueba, telefono: string) =>
    conNegocio(n.negocioId, async (tx) =>
      (await tx.consultar<{ c: number }>('SELECT count(*)::int AS c FROM clientes WHERE telefono = $1', [telefono])).rows[0]!.c);

  it('crea al cliente nuevo y reutiliza al existente aunque cambie el formato', async () => {
    const primero = await obtenerOCrearCliente(a.negocioId, { telefono: '311 000 0001', nombre: ' Ana ' });
    expect(primero).toMatchObject({ telefono: '573110000001', nombre: 'Ana', creado: true });
    const segundo = await obtenerOCrearCliente(a.negocioId, { telefono: '+57 311-000-0001' });
    expect(segundo).toMatchObject({ id: primero.id, creado: false });
  });

  it('completa un nombre vacío pero nunca pisa uno existente', async () => {
    const sinNombre = await obtenerOCrearCliente(a.negocioId, { telefono: '3110000002' });
    expect(sinNombre.nombre).toBeNull();
    expect((await obtenerOCrearCliente(a.negocioId, { telefono: '3110000002', nombre: 'Luis' })).nombre).toBe('Luis');
    expect((await obtenerOCrearCliente(a.negocioId, { telefono: '3110000002', nombre: 'Otro' })).nombre).toBe('Luis');
  });

  it('el mismo teléfono en dos negocios son dos clientes distintos', async () => {
    const enA = await obtenerOCrearCliente(a.negocioId, { telefono: '3110000003', nombre: 'Uno' });
    const enB = await obtenerOCrearCliente(b.negocioId, { telefono: '3110000003', nombre: 'Dos' });
    expect(enA.id).not.toBe(enB.id);
    expect([enA.nombre, enB.nombre]).toEqual(['Uno', 'Dos']);
  });

  it('peticiones simultáneas con el mismo teléfono crean un solo cliente', async () => {
    const r = await Promise.all(Array.from({ length: 6 }, () => obtenerOCrearCliente(a.negocioId, { telefono: '3110000004' })));
    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect(r.filter((x) => x.creado)).toHaveLength(1);
    expect(await contar(a, '573110000004')).toBe(1);
  });

  it('valida teléfono y nombre', async () => {
    await expect(obtenerOCrearCliente(a.negocioId, { telefono: 'xx' })).rejects.toBeInstanceOf(DatosInvalidos);
    await expect(obtenerOCrearCliente(a.negocioId, { telefono: '3110000005', nombre: 'n'.repeat(101) })).rejects.toBeInstanceOf(DatosInvalidos);
  });
});
