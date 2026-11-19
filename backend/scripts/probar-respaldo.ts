/**
 * Prueba de punta a punta de despliegue/respaldar.sh y despliegue/restaurar.sh (modo local):
 *   npm run respaldo:probar
 * Origen: turnoo_test (solo se lee; créala con npm run db:pruebas). Destino: turnoo_restaurar_test
 * (se crea y se borra). La base de desarrollo nunca se toca. Usa una llave gpg de prueba en una
 * carpeta temporal. Necesita gpg, pg_dump, pg_restore, createdb y psql en este equipo, y las
 * credenciales de administrador de npm run db:pruebas (no se imprimen).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { conexionAdmin } from './migraciones.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const ORIGEN = 'turnoo_test';
const DESTINO = 'turnoo_restaurar_test';
const ok = (c: boolean, m: string) => {
  console.log(c ? 'OK   ' : 'FALLA', m);
  if (!c) process.exitCode = 1;
};

const admin = conexionAdmin(ORIGEN);
if (admin.database !== ORIGEN) throw new Error('origen inesperado');
const envPg = { ...process.env, PGHOST: String(admin.host), PGPORT: String(admin.port), PGUSER: String(admin.user), PGPASSWORD: String(admin.password) };

async function consultar(base: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ ...admin, database: base });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows;
  } finally {
    await c.end();
  }
}
const borrarDestino = () => consultar('postgres', `DROP DATABASE IF EXISTS ${DESTINO} WITH (FORCE)`);

const trabajo = mkdtempSync(join(tmpdir(), 'turnoo-respaldo-'));
const gnupg = join(trabajo, 'gnupg');
const gnupgSoloPublica = join(trabajo, 'gnupg-publica');
mkdirSync(gnupg, { mode: 0o700 });
mkdirSync(gnupgSoloPublica, { mode: 0o700 });
const archivosOrigen = join(trabajo, 'datos', 'archivos');
mkdirSync(join(archivosOrigen, 'imagenes', 'negocio'), { recursive: true });
writeFileSync(join(archivosOrigen, 'imagenes', 'negocio', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]));
writeFileSync(join(archivosOrigen, 'imagenes', 'negocio', 'b.png'), 'png-de-prueba');
const copias = join(trabajo, 'backups');

try {
  await borrarDestino();
  // Llave de prueba, sin frase: solo vive en este directorio temporal.
  const gpg = (home: string, args: string[], entrada?: Buffer) => spawnSync('gpg', ['--homedir', home, '--batch', ...args], { input: entrada });
  gpg(gnupg, ['--passphrase', '', '--quick-gen-key', 'Copias Turnoo (prueba) <copias@prueba.invalid>', 'default', 'default', 'never']);
  const huella = /fpr:+([0-9A-F]{40}):/.exec(gpg(gnupg, ['--with-colons', '--list-keys']).stdout.toString())![1]!;
  gpg(gnupgSoloPublica, ['--import'], gpg(gnupg, ['--export', huella]).stdout);

  const respaldar = (extra: Record<string, string> = {}) =>
    spawnSync(join(RAIZ, 'despliegue/respaldar.sh'), {
      env: { ...envPg, GNUPGHOME: gnupgSoloPublica, RESPALDO_LOCAL: '1', PGDATABASE: ORIGEN, ARCHIVOS_DIR: archivosOrigen, RESPALDO_DIR: copias, RESPALDO_GPG_DESTINATARIO: huella, ...extra },
    });

  // 1. Respaldar (el "servidor" solo tiene la llave pública).
  const r1 = respaldar();
  ok(r1.status === 0, `respaldar.sh termina bien (${r1.stderr.toString().trim().split('\n').at(-1) ?? ''})`);
  const generados = readdirSync(copias).sort();
  ok(generados.length === 2 && generados.every((f) => f.endsWith('.gpg')), `deja dos copias .gpg: ${generados.join(', ')}`);
  const [archivosGpg, baseGpg] = generados.map((f) => join(copias, f)) as [string, string];
  ok(!readFileSync(baseGpg).subarray(0, 64).includes('PGDMP'), 'la copia de la base no está en claro (sin la firma PGDMP de pg_dump)');
  ok(!readFileSync(archivosGpg).includes('png-de-prueba'), 'la copia de las imágenes no está en claro');
  ok(gpg(gnupgSoloPublica, ['--decrypt', baseGpg]).status !== 0, 'con solo la llave pública no se puede abrir');
  ok(respaldar({ RESPALDO_GPG_DESTINATARIO: '' }).status !== 0, 'sin destinatario gpg se niega a respaldar');

  // 2. Rotación: una copia vieja se borra; una reciente se queda.
  const vieja = join(copias, 'turnoo-20000101T000000Z.dump.gpg');
  writeFileSync(vieja, 'vieja');
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  utimesSync(vieja, hace30, hace30);
  await new Promise((r) => setTimeout(r, 1100)); // otro segundo: nombres nuevos
  respaldar({ DIAS_RETENCION: '14' });
  const tras = readdirSync(copias);
  ok(!tras.includes('turnoo-20000101T000000Z.dump.gpg') && tras.length === 4, `rotación: borra la de hace 30 días y guarda las recientes (${tras.length} copias)`);

  // 3. Restaurar en una base nueva (con la llave privada).
  const carpetaNueva = join(trabajo, 'restaurado', 'archivos');
  const restaurar = (base: string, carpeta: string) =>
    spawnSync(join(RAIZ, 'despliegue/restaurar.sh'), [baseGpg, base, archivosGpg, carpeta], { env: { ...envPg, GNUPGHOME: gnupg, RESPALDO_LOCAL: '1' } });
  const r3 = restaurar(DESTINO, carpetaNueva);
  ok(r3.status === 0, `restaurar.sh termina bien (${r3.stdout.toString().trim().replace(/\n/g, ' / ')}${r3.stderr.toString().trim().slice(-300)})`);

  // 4. Comparar: cada tabla con las mismas filas, mismas políticas RLS y las imágenes iguales.
  const tablas = (await consultar(ORIGEN, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).map((f) => f.tablename as string);
  const contar = async (base: string) =>
    Object.fromEntries(await Promise.all(tablas.map(async (t) => [t, Number((await consultar(base, `SELECT count(*) AS n FROM public."${t}"`))[0]!.n)])));
  const [antes, despues] = [await contar(ORIGEN), await contar(DESTINO)];
  const distintas = tablas.filter((t) => antes[t] !== despues[t]);
  const filas = Object.values(antes).reduce((a: number, b) => a + (b as number), 0);
  ok(distintas.length === 0, `las ${tablas.length} tablas tienen las mismas filas (${filas} en total)${distintas.length ? `; distintas: ${distintas.join(', ')}` : ''}`);
  const politicas = async (base: string) => (await consultar(base, `SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'public'`))[0]!.n;
  ok((await politicas(ORIGEN)) === (await politicas(DESTINO)), `las políticas de RLS también (${await politicas(DESTINO)})`);
  const forzadas = await consultar(DESTINO, `SELECT count(*) AS n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relforcerowsecurity`);
  ok(Number(forzadas[0]!.n) > 0, `y FORCE ROW LEVEL SECURITY (${forzadas[0]!.n} tablas)`);
  const migraciones = await consultar(DESTINO, `SELECT max(archivo) AS n FROM migraciones_aplicadas`).catch(() => [{ n: '?' }]);
  console.log('      última migración en la copia:', migraciones[0]!.n);
  const igual = (a: string, b: string) => readFileSync(a).equals(readFileSync(b));
  ok(
    igual(join(archivosOrigen, 'imagenes/negocio/a.jpg'), join(carpetaNueva, 'archivos/imagenes/negocio/a.jpg')) &&
      igual(join(archivosOrigen, 'imagenes/negocio/b.png'), join(carpetaNueva, 'archivos/imagenes/negocio/b.png')),
    'las imágenes restauradas son idénticas',
  );

  // 5. Nunca escribe sobre algo que ya existe.
  ok(restaurar(DESTINO, join(trabajo, 'otra')).status === 1, 'se niega a restaurar en una base que ya existe');
  ok(restaurar('turnoo_restaurar_otra', carpetaNueva).status === 1, 'se niega a restaurar en una carpeta que ya existe');
  ok((await consultar('postgres', `SELECT 1 FROM pg_database WHERE datname = 'turnoo_restaurar_otra'`)).length === 0, '...y no deja una base a medias');
} finally {
  await borrarDestino();
  const queda = await consultar('postgres', `SELECT datname FROM pg_database WHERE datname LIKE 'turnoo_restaurar%'`);
  ok(queda.length === 0, `limpieza: ${DESTINO} borrada`);
  execFileSync('gpgconf', ['--homedir', gnupg, '--kill', 'all']);
  execFileSync('gpgconf', ['--homedir', gnupgSoloPublica, '--kill', 'all']);
  rmSync(trabajo, { recursive: true, force: true });
}
