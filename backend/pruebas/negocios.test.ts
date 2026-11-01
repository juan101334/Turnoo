import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conNegocio } from '../src/db/contexto.js';
import { crearNegocio, limpiar, type NegocioDePrueba } from './ayudas.js';

describe('negocios y usuarios', () => {
  let n: NegocioDePrueba;

  beforeAll(async () => {
    n = await crearNegocio('Barbería nueva');
  });
  afterAll(limpiar);

  it('un negocio nuevo recibe su sede principal', async () => {
    const sedes = await conNegocio(n.negocioId, async (tx) =>
      (await tx.consultar<{ nombre: string }>('SELECT nombre FROM sedes')).rows,
    );
    expect(sedes).toEqual([{ nombre: 'Sede principal' }]);
  });

  it('un negocio nuevo recibe la configuración por defecto', async () => {
    const config = await conNegocio(n.negocioId, async (tx) =>
      (await tx.consultar('SELECT * FROM configuracion_negocio')).rows[0],
    );
    expect(config).toMatchObject({
      intervalo_minutos: 15,
      anticipacion_min_minutos: 60,
      anticipacion_max_dias: 30,
      max_citas_activas_cliente: 2,
      horas_limite_cancelacion: 2,
      horas_recordatorio: 11,
      max_inasistencias: 3,
      ventana_inasistencias_dias: 30,
      horas_espera_aprobacion: 2,
      aprobacion_minutos_antes_cita: 60,
      horas_modo_humano: 2,
      horas_autocompletar_cita: 24,
    });
  });

  it('un negocio nuevo empieza en estado de prueba', async () => {
    const estado = await conNegocio(n.negocioId, async (tx) =>
      (await tx.consultar<{ estado: string }>('SELECT estado FROM negocios')).rows[0]?.estado,
    );
    expect(estado).toBe('prueba');
  });

  it('un dueño o empleado debe pertenecer a un negocio', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO usuarios (negocio_id, email, nombre, rol) VALUES (NULL, 'sin-negocio@prueba.com', 'X', 'dueno')`,
        ),
      ),
    ).rejects.toBeDefined();
  });

  it('un superadmin no puede pertenecer a un negocio', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar(
          `INSERT INTO usuarios (negocio_id, email, nombre, rol) VALUES ($1, 'super-con-negocio@prueba.com', 'X', 'superadmin')`,
          [n.negocioId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('no permite un teléfono de cliente con formato inválido', async () => {
    await expect(
      conNegocio(n.negocioId, (tx) =>
        tx.consultar('INSERT INTO clientes (negocio_id, telefono) VALUES ($1, $2)', [n.negocioId, '+57 300 123']),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
