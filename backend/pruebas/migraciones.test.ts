import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aplicarPendientes,
  conexionAdmin,
  cuerpoSinTransaccion,
  ErrorDeMigracion,
  estado,
  leerMigraciones,
  pendientes,
  registrarHasta,
} from '../scripts/migraciones.js';

// Las pruebas con base usan las credenciales de administrador del .env de la raíz y una base
// propia y desechable; nunca tocan "turnoo" ni "turnoo_test".
try {
  process.loadEnvFile('../.env');
} catch {
  // Sin .env de la raíz: esas pruebas se saltan.
}
const hayAdmin = Boolean(process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD);
const BASE = 'turnoo_migraciones_test';

const envolver = (cuerpo: string) => `-- comentario\nBEGIN;\n${cuerpo}\nCOMMIT;\n`;

let carpeta: string;
function escribir(archivo: string, contenido: string) {
  writeFileSync(join(carpeta, archivo), contenido);
}

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'turnoo-migraciones-'));
});
afterEach(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

describe('cuerpoSinTransaccion', () => {
  it('quita BEGIN y COMMIT y deja el cuerpo', () => {
    expect(cuerpoSinTransaccion('001_a.sql', envolver('CREATE TABLE a (x int);'))).toBe('CREATE TABLE a (x int);');
  });

  it('acepta finales de línea de Windows', () => {
    expect(cuerpoSinTransaccion('001_a.sql', 'BEGIN;\r\nSELECT 1;\r\nCOMMIT;\r\n')).toBe('SELECT 1;');
  });

  it.each([
    ['sin BEGIN', 'SELECT 1;\nCOMMIT;\n'],
    ['sin COMMIT', 'BEGIN;\nSELECT 1;\n'],
    ['dos BEGIN', 'BEGIN;\nBEGIN;\nSELECT 1;\nCOMMIT;\n'],
    ['dos COMMIT', 'BEGIN;\nSELECT 1;\nCOMMIT;\nBEGIN;\nCOMMIT;\n'],
    ['algo después de COMMIT', 'BEGIN;\nSELECT 1;\nCOMMIT;\nSELECT 2;\n'],
    ['una sentencia antes de BEGIN', 'SELECT 0;\nBEGIN;\nSELECT 1;\nCOMMIT;\n'],
  ])('rechaza un archivo %s', (_caso, sql) => {
    expect(() => cuerpoSinTransaccion('001_a.sql', sql)).toThrow(ErrorDeMigracion);
  });
});

describe('leerMigraciones', () => {
  it('las ordena por número, con su huella', () => {
    escribir('002_b.sql', envolver('SELECT 2;'));
    escribir('001_a.sql', envolver('SELECT 1;'));
    const m = leerMigraciones(carpeta);
    expect(m.map((x) => [x.archivo, x.numero])).toEqual([
      ['001_a.sql', 1],
      ['002_b.sql', 2],
    ]);
    expect(m[0]!.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(m[0]!.huella).not.toBe(m[1]!.huella);
  });

  it.each(['1_a.sql', '001-a.sql', '001_A.sql'])('rechaza el nombre %s', (archivo) => {
    escribir(archivo, envolver('SELECT 1;'));
    expect(() => leerMigraciones(carpeta)).toThrow(ErrorDeMigracion);
  });

  it('rechaza dos archivos con el mismo número', () => {
    escribir('001_a.sql', envolver('SELECT 1;'));
    escribir('001_b.sql', envolver('SELECT 1;'));
    expect(() => leerMigraciones(carpeta)).toThrow(/mismo número/);
  });

  it('el real: todas las migraciones del proyecto cumplen las reglas', () => {
    expect(leerMigraciones().length).toBeGreaterThanOrEqual(13);
  });
});

describe('pendientes', () => {
  const m = (numero: number, huella = 'h' + numero) => ({ archivo: `00${numero}_x.sql`, numero, huella, cuerpo: '' });

  it('devuelve las que faltan, en orden', () => {
    expect(pendientes([m(1), m(2), m(3)], new Map([['001_x.sql', 'h1']])).map((x) => x.numero)).toEqual([2, 3]);
  });

  it('se detiene si una aplicada cambió', () => {
    expect(() => pendientes([m(1, 'otra')], new Map([['001_x.sql', 'h1']]))).toThrow(/cambió/);
  });

  it('se detiene si una aplicada ya no está en la carpeta', () => {
    expect(() => pendientes([m(2)], new Map([['001_x.sql', 'h1']]))).toThrow(/ya no está/);
  });

  it('se detiene si una nueva tiene número menor que la última aplicada', () => {
    expect(() => pendientes([m(1), m(2)], new Map([['002_x.sql', 'h2']]))).toThrow(/número menor/);
  });
});

describe.skipIf(!hayAdmin)('con base de datos', () => {
  let cliente: pg.Client;

  async function recrearBase() {
    const admin = new pg.Client(conexionAdmin('postgres'));
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${BASE}`);
    await admin.end();
  }

  beforeEach(async () => {
    await recrearBase();
    cliente = new pg.Client(conexionAdmin(BASE));
    await cliente.connect();
  });
  afterEach(async () => {
    await cliente.end();
  });
  afterAll(async () => {
    const admin = new pg.Client(conexionAdmin('postgres'));
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
    await admin.end();
  });

  const tablas = async () =>
    (await cliente.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map((f) => f.t);
  const anotadas = async () =>
    (await cliente.query<{ archivo: string; solo_registrada: boolean }>('SELECT archivo, solo_registrada FROM migraciones_aplicadas ORDER BY 1')).rows;

  it('aplica las pendientes en orden, las anota y la segunda vez no hace nada', async () => {
    escribir('001_a.sql', envolver('CREATE TABLE a (x int);'));
    escribir('002_b.sql', envolver('CREATE TABLE b (y int);'));
    expect(await aplicarPendientes(cliente, carpeta)).toEqual(['001_a.sql', '002_b.sql']);
    expect(await tablas()).toEqual(['a', 'b', 'migraciones_aplicadas']);
    expect(await anotadas()).toEqual([
      { archivo: '001_a.sql', solo_registrada: false },
      { archivo: '002_b.sql', solo_registrada: false },
    ]);
    expect(await aplicarPendientes(cliente, carpeta)).toEqual([]);

    escribir('003_c.sql', envolver('CREATE TABLE c (z int);'));
    expect(await estado(cliente, carpeta)).toEqual({ aplicadas: ['001_a.sql', '002_b.sql'], pendientes: ['003_c.sql'], migradaAMano: false });
    expect(await aplicarPendientes(cliente, carpeta)).toEqual(['003_c.sql']);
  });

  it('si una falla, no queda nada de ella ni su anotación, y las anteriores se conservan', async () => {
    escribir('001_a.sql', envolver('CREATE TABLE a (x int);'));
    escribir('002_b.sql', envolver('CREATE TABLE b (y int);\nSELECT * FROM no_existe;'));
    await expect(aplicarPendientes(cliente, carpeta)).rejects.toThrow(/002_b\.sql falló/);
    expect(await tablas()).toEqual(['a', 'migraciones_aplicadas']);
    expect((await anotadas()).map((f) => f.archivo)).toEqual(['001_a.sql']);
  });

  it('no sigue si una migración aplicada se editó', async () => {
    escribir('001_a.sql', envolver('CREATE TABLE a (x int);'));
    await aplicarPendientes(cliente, carpeta);
    escribir('001_a.sql', envolver('CREATE TABLE a (x bigint);'));
    escribir('002_b.sql', envolver('CREATE TABLE b (y int);'));
    await expect(aplicarPendientes(cliente, carpeta)).rejects.toThrow(/cambió/);
    expect(await tablas()).toEqual(['a', 'migraciones_aplicadas']);
  });

  it('en una base migrada a mano no aplica nada hasta anotar con registrarHasta', async () => {
    escribir('001_a.sql', envolver('CREATE TABLE negocios (x int);'));
    escribir('002_b.sql', envolver('CREATE TABLE b (y int);'));
    escribir('003_c.sql', envolver('CREATE TABLE c (z int);'));
    await cliente.query('CREATE TABLE negocios (x int); CREATE TABLE b (y int);'); // "aplicadas a mano" 001 y 002

    expect((await estado(cliente, carpeta)).migradaAMano).toBe(true);
    await expect(aplicarPendientes(cliente, carpeta)).rejects.toThrow(/--registrar-hasta/);
    expect(await tablas()).toEqual(['b', 'negocios']);

    await expect(registrarHasta(cliente, 9, carpeta)).rejects.toThrow(/No hay una migración/);
    expect(await registrarHasta(cliente, 2, carpeta)).toEqual(['001_a.sql', '002_b.sql']);
    expect(await anotadas()).toEqual([
      { archivo: '001_a.sql', solo_registrada: true },
      { archivo: '002_b.sql', solo_registrada: true },
    ]);
    await expect(registrarHasta(cliente, 3, carpeta)).rejects.toThrow(/primera vez/);

    expect(await aplicarPendientes(cliente, carpeta)).toEqual(['003_c.sql']);
    expect(await tablas()).toEqual(['b', 'c', 'migraciones_aplicadas', 'negocios']);
  });

  it('la aplicación (turnoo_app) no puede leer ni cambiar el registro', async () => {
    // Igual que en la base real, donde la migración 001 da permisos por defecto a turnoo_app.
    await cliente.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turnoo_app');
    escribir('001_a.sql', envolver('CREATE TABLE a (x int);'));
    await aplicarPendientes(cliente, carpeta);
    const { rows } = await cliente.query<{ puede: boolean }>(
      `SELECT has_table_privilege('turnoo_app', 'migraciones_aplicadas', 'SELECT, INSERT, UPDATE, DELETE') AS puede`,
    );
    expect(rows[0]!.puede).toBe(false);
  });
});
