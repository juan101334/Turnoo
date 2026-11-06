import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { conNegocio, conSistema } from '../src/db/contexto.js';
import { iniciarSesion } from '../src/modulos/auth/auth.servicio.js';
import { bloquearNegocio } from '../src/modulos/conocimiento/conocimiento.repositorio.js';
import {
  MAX_CARACTERES_ACTIVOS,
  MAX_ENTRADAS,
  MAX_PREGUNTA,
  MAX_RESPUESTA,
} from '../src/modulos/conocimiento/conocimiento.servicio.js';
import { crearNegocio, crearProfesional, limpiar, type NegocioDePrueba } from './ayudas.js';

const CLAVE = 'clave-de-prueba-1';
const NINGUNO = '00000000-0000-4000-8000-000000000000';

describe('base de conocimiento', () => {
  let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>;
  let base: string;
  let a: NegocioDePrueba;
  let b: NegocioDePrueba;
  let duenoA: string;
  let duenoB: string;
  let empleadoA: string;
  let admin: string;
  const superadmins: string[] = [];

  async function sesion(n: NegocioDePrueba | null, rol: string): Promise<string> {
    const email = `${randomUUID()}@prueba.com`;
    const hash = await argon2.hash(CLAVE);
    const sql = `INSERT INTO usuarios (negocio_id, email, nombre, rol, activo, password_hash)
                 VALUES ($1, $2, 'Persona', $3, true, $4) RETURNING id`;
    const params = [n?.negocioId ?? null, email, rol, hash];
    const { rows } = n
      ? await conNegocio(n.negocioId, (tx) => tx.consultar<{ id: string }>(sql, params))
      : await conSistema((tx) => tx.consultar<{ id: string }>(sql, params));
    if (!n) superadmins.push(rows[0]!.id);
    return (await iniciarSesion(email, CLAVE)).token;
  }

  const api = async (token: string | null, metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await r.text();
    return { status: r.status, json: texto ? JSON.parse(texto) : null };
  };

  /** Pregunta distinta en cada llamada, para no chocar con la regla de preguntas repetidas. */
  let preguntas = 0;
  const pregunta = () => `¿Pregunta ${++preguntas}?`;

  /** Un negocio vacío con su dueño, para las pruebas que cuentan entradas o caracteres. */
  async function negocioConDueno(): Promise<{ n: NegocioDePrueba; dueno: string }> {
    const n = await crearNegocio('Negocio de una prueba');
    return { n, dueno: await sesion(n, 'dueno') };
  }

  /** Inserta directo en la base, sin pasar por los topes, para preparar un caso. */
  async function insertar(n: NegocioDePrueba, p: string, r: string, activo = true): Promise<string> {
    const { rows } = await conNegocio(n.negocioId, (tx) =>
      tx.consultar<{ id: string }>(
        'INSERT INTO conocimiento (negocio_id, pregunta, respuesta, activo) VALUES ($1, $2, $3, $4) RETURNING id',
        [n.negocioId, p, r, activo],
      ),
    );
    return rows[0]!.id;
  }

  const fijarEstado = (n: NegocioDePrueba, estado: string) =>
    conSistema((tx) => tx.consultar('UPDATE negocios SET estado = $2 WHERE id = $1', [n.negocioId, estado]));

  beforeAll(async () => {
    servidor = crearApp().listen(0);
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    a = await crearNegocio('A');
    b = await crearNegocio('B');
    duenoA = await sesion(a, 'dueno');
    duenoB = await sesion(b, 'dueno');
    await crearProfesional(a);
    empleadoA = await sesion(a, 'empleado');
    admin = await sesion(null, 'superadmin');
  });

  afterAll(async () => {
    await new Promise((r) => servidor.close(r));
    await limpiar();
    await conSistema((tx) => tx.consultar('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [superadmins]));
  });

  describe('permisos', () => {
    it('sin sesión responde 401 en todas las rutas', async () => {
      for (const [metodo, ruta] of [
        ['GET', '/conocimiento'],
        ['POST', '/conocimiento'],
        ['PATCH', `/conocimiento/${NINGUNO}`],
        ['DELETE', `/conocimiento/${NINGUNO}`],
      ] as const) {
        expect((await api(null, metodo, ruta, metodo === 'GET' ? undefined : {})).status).toBe(401);
      }
    });

    it('el empleado y el superadmin no entran', async () => {
      const id = await insertar(a, pregunta(), 'Respuesta');
      for (const token of [empleadoA, admin]) {
        expect((await api(token, 'GET', '/conocimiento')).status).toBe(403);
        expect((await api(token, 'POST', '/conocimiento', { pregunta: pregunta(), respuesta: 'R' })).status).toBe(403);
        expect((await api(token, 'PATCH', `/conocimiento/${id}`, { activo: false })).status).toBe(403);
        expect((await api(token, 'DELETE', `/conocimiento/${id}`)).status).toBe(403);
      }
      const [fila] = await conNegocio(a.negocioId, async (tx) =>
        (await tx.consultar<{ activo: boolean }>('SELECT activo FROM conocimiento WHERE id = $1', [id])).rows,
      );
      expect(fila?.activo).toBe(true);
    });

    it('cada dueño ve y cambia solo la base de su negocio', async () => {
      const deA = await insertar(a, pregunta(), 'Solo de A');
      const lista = await api(duenoB, 'GET', '/conocimiento');
      expect(lista.json.entradas.map((e: { id: string }) => e.id)).not.toContain(deA);
      expect((await api(duenoB, 'PATCH', `/conocimiento/${deA}`, { respuesta: 'De B' })).status).toBe(404);
      expect((await api(duenoB, 'DELETE', `/conocimiento/${deA}`)).status).toBe(404);
      const enA = await api(duenoA, 'GET', '/conocimiento');
      expect(enA.json.entradas.find((e: { id: string }) => e.id === deA)?.respuesta).toBe('Solo de A');
    });
  });

  describe('crear y listar', () => {
    it('crea una entrada activa, sin espacios de sobra ni caracteres nulos', async () => {
      const r = await api(duenoA, 'POST', '/conocimiento', {
        pregunta: '  ¿Tienen parqueadero?  ',
        respuesta: '\u0000 Sí, frente al local.\n',
      });
      expect(r.status).toBe(201);
      expect(r.json).toMatchObject({ pregunta: '¿Tienen parqueadero?', respuesta: 'Sí, frente al local.', activo: true });
      expect(r.json.id).toEqual(expect.any(String));
    });

    it('puede crearse inactiva', async () => {
      const r = await api(duenoA, 'POST', '/conocimiento', { pregunta: pregunta(), respuesta: 'R', activo: false });
      expect(r.status).toBe(201);
      expect(r.json.activo).toBe(false);
    });

    it('lista activas primero y cuenta solo los caracteres de las activas', async () => {
      const { n, dueno } = await negocioConDueno();
      const inactiva = await insertar(n, 'Vieja', 'No va', false);
      const activa = await insertar(n, 'Hola', 'Mundo🙂');
      const r = await api(dueno, 'GET', '/conocimiento');
      expect(r.status).toBe(200);
      expect(r.json.entradas.map((e: { id: string }) => e.id)).toEqual([activa, inactiva]);
      // 'Hola' + 'Mundo🙂': el emoji cuenta como un carácter.
      expect(r.json).toMatchObject({
        caracteresActivos: 10,
        maxCaracteresActivos: MAX_CARACTERES_ACTIVOS,
        maxEntradas: MAX_ENTRADAS,
      });
    });

    it('una base vacía responde la lista vacía y cero caracteres', async () => {
      const { dueno } = await negocioConDueno();
      const r = await api(dueno, 'GET', '/conocimiento');
      expect(r.json).toMatchObject({ entradas: [], caracteresActivos: 0 });
    });

    it('rechaza pregunta o respuesta vacía, ausente o con campos de más', async () => {
      for (const cuerpo of [
        { pregunta: '   ', respuesta: 'R' },
        { pregunta: pregunta(), respuesta: '\u0000 ' },
        { pregunta: pregunta() },
        { respuesta: 'R' },
        { pregunta: pregunta(), respuesta: 'R', negocioId: b.negocioId },
        { pregunta: pregunta(), respuesta: 'R', activo: 'si' },
      ]) {
        const r = await api(duenoA, 'POST', '/conocimiento', cuerpo);
        expect(r.status, JSON.stringify(cuerpo)).toBe(400);
        expect(r.json.error.codigo).toBe('DATOS_INVALIDOS');
      }
    });

    it('cuenta el largo en caracteres, no en bytes ni en unidades de JavaScript', async () => {
      const justa = await api(duenoA, 'POST', '/conocimiento', {
        pregunta: '🙂'.repeat(MAX_PREGUNTA),
        respuesta: '🙂'.repeat(MAX_RESPUESTA),
      });
      expect(justa.status).toBe(201);
      for (const cuerpo of [
        { pregunta: `${pregunta()}${'x'.repeat(MAX_PREGUNTA)}`, respuesta: 'R' },
        { pregunta: pregunta(), respuesta: 'x'.repeat(MAX_RESPUESTA + 1) },
      ]) {
        const r = await api(duenoA, 'POST', '/conocimiento', cuerpo);
        expect(r.status).toBe(400);
        expect(r.json.error.mensaje).toMatch(/no puede pasar de/);
      }
    });

    it('no admite dos entradas con la misma pregunta, sin importar mayúsculas', async () => {
      const p = `¿Horario de ${randomUUID()}?`;
      expect((await api(duenoA, 'POST', '/conocimiento', { pregunta: p, respuesta: 'R' })).status).toBe(201);
      const repetida = await api(duenoA, 'POST', '/conocimiento', { pregunta: ` ${p.toUpperCase()} `, respuesta: 'R' });
      expect(repetida.status).toBe(409);
      expect(repetida.json.error.codigo).toBe('DUPLICADO');
      // Otro negocio sí puede tener la misma pregunta.
      expect((await api(duenoB, 'POST', '/conocimiento', { pregunta: p, respuesta: 'R' })).status).toBe(201);
    });
  });

  describe('topes', () => {
    it('no deja pasar del máximo de entradas, aunque estén inactivas', async () => {
      const { n, dueno } = await negocioConDueno();
      await conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO conocimiento (negocio_id, pregunta, respuesta, activo)
           SELECT $1, 'P' || i, 'R', false FROM generate_series(1, $2::int) AS i`,
          [n.negocioId, MAX_ENTRADAS - 1],
        ),
      );
      expect((await api(dueno, 'POST', '/conocimiento', { pregunta: 'Última', respuesta: 'R' })).status).toBe(201);
      const r = await api(dueno, 'POST', '/conocimiento', { pregunta: 'Una más', respuesta: 'R' });
      expect(r.status).toBe(409);
      expect(r.json.error.mensaje).toContain(String(MAX_ENTRADAS));
    });

    it('no deja pasar del máximo de caracteres activos al crear', async () => {
      const { n, dueno } = await negocioConDueno();
      // Quedan 10 caracteres libres.
      await insertar(n, 'P', 'x'.repeat(MAX_CARACTERES_ACTIVOS - 11));
      expect((await api(dueno, 'POST', '/conocimiento', { pregunta: 'Diez chars', respuesta: 'xx' })).status).toBe(409);
      expect((await api(dueno, 'POST', '/conocimiento', { pregunta: 'Diez chars', respuesta: 'x', activo: false })).status).toBe(201);
      expect((await api(dueno, 'POST', '/conocimiento', { pregunta: 'Nueve', respuesta: 'xxxxx' })).status).toBe(201);
      const lista = await api(dueno, 'GET', '/conocimiento');
      expect(lista.json.caracteresActivos).toBe(MAX_CARACTERES_ACTIVOS);
    });

    it('activar o alargar una entrada respeta el máximo; desactivar o acortar no', async () => {
      const { n, dueno } = await negocioConDueno();
      await insertar(n, 'P', 'x'.repeat(MAX_CARACTERES_ACTIVOS - 11));
      const inactiva = await insertar(n, 'Inactiva', 'xxxxxxxxxx', false);
      const activa = await insertar(n, 'Activa', 'xxxx');

      const activar = await api(dueno, 'PATCH', `/conocimiento/${inactiva}`, { activo: true });
      expect(activar.status).toBe(409);
      expect(activar.json.error.codigo).toBe('CONFLICTO');
      // La activa ocupa 10 y su largo viejo no se cuenta dos veces: puede quedar igual de larga.
      expect((await api(dueno, 'PATCH', `/conocimiento/${activa}`, { respuesta: 'yyyy' })).status).toBe(200);
      expect((await api(dueno, 'PATCH', `/conocimiento/${activa}`, { respuesta: 'yyyyy' })).status).toBe(409);
      expect((await api(dueno, 'PATCH', `/conocimiento/${activa}`, { activo: false })).status).toBe(200);
      expect((await api(dueno, 'PATCH', `/conocimiento/${inactiva}`, { activo: true, respuesta: 'z' })).status).toBe(200);
    });

    it('dos altas simultáneas no pasan juntas el máximo de caracteres', async () => {
      const { n, dueno } = await negocioConDueno();
      await insertar(n, 'P', 'x'.repeat(MAX_CARACTERES_ACTIVOS - 11));
      const respuestas = await Promise.all(
        ['Uno', 'Dos', 'Tre', 'Cua'].map((p) => api(dueno, 'POST', '/conocimiento', { pregunta: p, respuesta: 'xxxxx' })),
      );
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    });

    it('un alta espera a la que tiene el negocio bloqueado y cuenta con lo que esta dejó', async () => {
      const { n, dueno } = await negocioConDueno();
      await insertar(n, 'P', 'x'.repeat(MAX_CARACTERES_ACTIVOS - 11));
      let avisarBloqueo!: () => void;
      let soltar!: () => void;
      const bloqueado = new Promise<void>((r) => { avisarBloqueo = r; });
      const liberado = new Promise<void>((r) => { soltar = r; });

      const enCurso = conNegocio(n.negocioId, async (tx) => {
        await bloquearNegocio(tx, n.negocioId);
        avisarBloqueo();
        await liberado;
        await tx.consultar(
          'INSERT INTO conocimiento (negocio_id, pregunta, respuesta) VALUES ($1, $2, $3)',
          [n.negocioId, 'En curso', 'xx'],
        );
      });
      await bloqueado;
      const segunda = api(dueno, 'POST', '/conocimiento', { pregunta: 'Segunda', respuesta: 'xx' });
      await new Promise((r) => setTimeout(r, 150));
      soltar();
      await enCurso;

      expect((await segunda).status).toBe(409);
    });
  });

  describe('editar y borrar', () => {
    it('cambia solo los campos indicados', async () => {
      const id = await insertar(a, pregunta(), 'Respuesta vieja');
      const r = await api(duenoA, 'PATCH', `/conocimiento/${id}`, { respuesta: '  Respuesta nueva ' });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ id, respuesta: 'Respuesta nueva', activo: true });
      const otra = await api(duenoA, 'PATCH', `/conocimiento/${id}`, { activo: false });
      expect(otra.json).toMatchObject({ respuesta: 'Respuesta nueva', activo: false });
      expect(new Date(otra.json.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(r.json.updatedAt).getTime());
    });

    it('puede conservar su propia pregunta pero no tomar la de otra entrada', async () => {
      const p1 = pregunta();
      const p2 = pregunta();
      const id = await insertar(a, p1, 'R');
      await insertar(a, p2, 'R');
      expect((await api(duenoA, 'PATCH', `/conocimiento/${id}`, { pregunta: p1.toUpperCase() })).status).toBe(200);
      const choque = await api(duenoA, 'PATCH', `/conocimiento/${id}`, { pregunta: p2 });
      expect(choque.status).toBe(409);
      expect(choque.json.error.codigo).toBe('DUPLICADO');
    });

    it('rechaza un cambio vacío, campos de más o textos vacíos', async () => {
      const id = await insertar(a, pregunta(), 'R');
      for (const cuerpo of [
        {},
        { otro: 1 },
        { activo: false, negocioId: b.negocioId },
        { pregunta: ' ' },
        { respuesta: '' },
        { activo: null },
      ]) {
        expect((await api(duenoA, 'PATCH', `/conocimiento/${id}`, cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
      }
    });

    it('una entrada que no existe o un id mal escrito responde 404', async () => {
      for (const id of [NINGUNO, 'no-es-uuid']) {
        expect((await api(duenoA, 'PATCH', `/conocimiento/${id}`, { activo: true })).status).toBe(404);
        expect((await api(duenoA, 'DELETE', `/conocimiento/${id}`)).status).toBe(404);
      }
    });

    it('borra la entrada', async () => {
      const id = await insertar(a, pregunta(), 'R');
      expect((await api(duenoA, 'DELETE', `/conocimiento/${id}`)).status).toBe(204);
      expect((await api(duenoA, 'DELETE', `/conocimiento/${id}`)).status).toBe(404);
      const lista = await api(duenoA, 'GET', '/conocimiento');
      expect(lista.json.entradas.map((e: { id: string }) => e.id)).not.toContain(id);
    });
  });

  it('un negocio suspendido puede consultar su base pero no cambiarla', async () => {
    const { n, dueno } = await negocioConDueno();
    const id = await insertar(n, 'P', 'R');
    await fijarEstado(n, 'suspendido');
    expect((await api(dueno, 'GET', '/conocimiento')).status).toBe(200);
    expect((await api(dueno, 'POST', '/conocimiento', { pregunta: 'Otra', respuesta: 'R' })).status).toBe(403);
    expect((await api(dueno, 'PATCH', `/conocimiento/${id}`, { activo: false })).status).toBe(403);
    expect((await api(dueno, 'DELETE', `/conocimiento/${id}`)).status).toBe(403);
    const lista = await api(dueno, 'GET', '/conocimiento');
    expect(lista.json.entradas).toHaveLength(1);
  });
});
