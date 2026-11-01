import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatosInvalidos } from '../src/compartido/errores.js';
import { conNegocio } from '../src/db/contexto.js';
import { crearNegocio, crearProfesional, limpiar, type NegocioDePrueba } from './ayudas.js';

describe('horarios de trabajo', () => {
  let n: NegocioDePrueba;

  beforeAll(async () => {
    n = await crearNegocio();
  });
  afterAll(limpiar);

  const agregar = (profesionalId: string, dia: number, inicio: string, fin: string) =>
    conNegocio(n.negocioId, (tx) =>
      tx.consultar(
        `INSERT INTO horarios_trabajo (negocio_id, profesional_id, dia_semana, hora_inicio, hora_fin)
         VALUES ($1, $2, $3, $4, $5)`,
        [n.negocioId, profesionalId, dia, inicio, fin],
      ),
    );

  it('permite varios rangos el mismo día (el almuerzo es el hueco)', async () => {
    const barbero = await crearProfesional(n);
    await agregar(barbero, 1, '08:00', '12:00');
    await expect(agregar(barbero, 1, '14:00', '19:00')).resolves.toBeDefined();
  });

  it('permite rangos pegados', async () => {
    const barbero = await crearProfesional(n);
    await agregar(barbero, 2, '08:00', '12:00');
    await expect(agregar(barbero, 2, '12:00', '14:00')).resolves.toBeDefined();
  });

  it('rechaza rangos que se cruzan el mismo día', async () => {
    const barbero = await crearProfesional(n);
    await agregar(barbero, 3, '08:00', '12:00');
    await expect(agregar(barbero, 3, '11:00', '15:00')).rejects.toBeInstanceOf(DatosInvalidos);
  });

  it('permite el mismo rango en días distintos', async () => {
    const barbero = await crearProfesional(n);
    await agregar(barbero, 4, '08:00', '12:00');
    await expect(agregar(barbero, 5, '08:00', '12:00')).resolves.toBeDefined();
  });

  it('rechaza un rango que termina antes de empezar', async () => {
    const barbero = await crearProfesional(n);
    await expect(agregar(barbero, 1, '12:00', '08:00')).rejects.toMatchObject({ code: '23514' });
  });

  it('rechaza un día de la semana fuera de 1 a 7', async () => {
    const barbero = await crearProfesional(n);
    await expect(agregar(barbero, 8, '08:00', '12:00')).rejects.toMatchObject({ code: '23514' });
  });
});
