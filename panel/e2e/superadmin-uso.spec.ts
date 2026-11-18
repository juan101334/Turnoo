import { expect, test, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import { datos, entrarYEsperar } from './datos';

/**
 * Uso de la plataforma para el superadmin. Lo sembrado (backend/pruebas/e2e/sembrar.ts):
 *  - "Barbería E2E": plan de 50 conversaciones y lleva 42 (84%); hoy, 2 respuestas del asistente,
 *    3 mensajes automáticos y 1,5 minutos de audio.
 *  - "Uso E2E Prueba": en prueba, vence en 3 días, sin plan y sin citas desde hace 20 días.
 *  - "Uso E2E Activa": activa, con el plan de $50.000, sin citas desde hace 20 días.
 * El backend de pruebas lleva tarifas ficticias (entorno.ts), así que hay costo en pesos.
 */

const hoy = () => DateTime.now().setZone('America/Bogota');
const nombreDelMes = (mes: DateTime) => mes.setLocale('es-CO').toFormat("LLLL 'de' yyyy");

async function abrirUso(page: Page) {
  await entrarYEsperar(page, datos().superadmin, '/superadmin');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Uso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Uso' })).toBeVisible();
}

const totales = (page: Page) => page.getByRole('region', { name: 'Totales del mes' });

test.describe('uso de la plataforma (superadmin)', () => {
  test('muestra los totales del mes, con el ingreso contratado solo de los negocios activos', async ({ page }) => {
    await abrirUso(page);
    await expect(page).toHaveURL('/superadmin/uso');
    const t = totales(page);
    // Solo "Uso E2E Activa" paga: los que están en prueba no suman, aunque tengan plan.
    await expect(t).toContainText('Ingreso mensual contratado$50.000');
    await expect(t).toContainText('Conversaciones con el asistente42');
    await expect(t).toContainText('1 M tokens de entrada · 500 mil de salida');
    await expect(t).toContainText('Mensajes automáticos3');
    // Las respuestas que mandan otras pruebas varían; con 1.000 gratis por número, ninguna se cobra.
    await expect(t).toContainText(/Mensajes de servicio\d+Respuestas del asistente y del panel: \d+ gratis · 0 se cobran\./);
    await expect(t).toContainText('Audio transcrito1,5 min');
    // Tarifas ficticias: 1 M x 1000 + 0,5 M x 2000 = 2000; 1,5 min x 60 = 90; 3 x 10 = 30.
    await expect(t).toContainText('Costo estimado$2.120');
    await expect(t).toContainText('servicio $0. Queda $47.880 del ingreso contratado.');
  });

  test('las alertas dicen qué negocio pide atención y por qué', async ({ page }) => {
    await abrirUso(page);
    const alertas = page.getByRole('list', { name: 'Alertas' });
    await expect(alertas.getByRole('link', { name: /Barbería E2E/ })).toContainText('Va en el 84% de las conversaciones de su plan Prueba E2E (42 de 50). Candidato a subir de plan.');
    await expect(alertas.getByRole('link', { name: /Uso E2E Prueba.*La prueba vence/ })).toBeVisible();
    await expect(alertas.getByRole('link', { name: /Uso E2E Prueba.*Nunca ha tenido una cita/ })).toBeVisible();
    await expect(alertas.getByRole('link', { name: /Uso E2E Activa.*Nunca ha tenido una cita/ })).toBeVisible();
    // La barbería con citas y prueba a 20 días solo sale por el límite del plan.
    await expect(alertas.getByRole('link', { name: /Barbería E2E/ })).toHaveCount(1);
  });

  test('el gráfico diario cambia de serie y dice desde cuándo hay detalle', async ({ page }) => {
    await abrirUso(page);
    const porDia = page.getByRole('region', { name: 'Por día' });
    const dia = hoy().day;
    await expect(porDia.getByRole('img')).toHaveAccessibleName(new RegExp(`Respuestas del asistente por día en .*: 2 en el mes\\. El día con más fue el ${dia}, con 2\\.`));

    await porDia.getByRole('link', { name: 'Mensajes automáticos' }).click();
    await expect(page).toHaveURL(/ver=mensajes/);
    await expect(porDia.getByRole('img')).toHaveAccessibleName(/Mensajes automáticos por día en .*: 3 en el mes/);
    await expect(porDia.getByRole('link', { name: 'Mensajes automáticos' })).toHaveAttribute('aria-current', 'true');

    // Los números exactos, en la tabla plegada.
    await porDia.getByText('Ver los números de cada día').click();
    const fila = porDia.getByRole('row').nth(dia);
    await expect(fila.getByRole('cell')).toHaveText(['2', '3', '1,5 min', /\d+/]);

    // El mes pasado es anterior al registro: se avisa que no hay detalle por día.
    await page.getByRole('link', { name: /Mes anterior/ }).click();
    await expect(page).toHaveURL(new RegExp(`mes=${hoy().minus({ months: 1 }).toFormat('yyyy-MM')}`));
    await expect(porDia.getByRole('status')).toContainText('no hay detalle por día');
    // Las citas creadas sí tienen historia: en esa serie no hay aviso.
    await porDia.getByRole('link', { name: 'Citas creadas' }).click();
    await expect(page).toHaveURL(/ver=citas/);
    await expect(porDia.getByRole('status')).toHaveCount(0);
  });

  test('cambiar de mes muestra ese mes y no deja pasar del actual', async ({ page }) => {
    await abrirUso(page);
    const mes = page.getByRole('navigation', { name: 'Mes' });
    await expect(mes).toContainText(nombreDelMes(hoy()));
    await expect(mes.getByRole('link', { name: /Mes siguiente/ })).toHaveCount(0);

    await mes.getByRole('link', { name: /Mes anterior/ }).click();
    await expect(mes).toContainText(nombreDelMes(hoy().minus({ months: 1 })));
    await expect(totales(page)).toContainText('Conversaciones con el asistente0');
    // Las alertas son de hoy: no dependen del mes.
    await expect(page.getByRole('list', { name: 'Alertas' }).getByRole('link', { name: /Barbería E2E/ })).toBeVisible();

    await mes.getByRole('link', { name: /Mes siguiente/ }).click();
    await expect(page).toHaveURL('/superadmin/uso');
    await expect(totales(page)).toContainText('Conversaciones con el asistente42');

    // Un mes futuro o mal escrito en la URL se toma como el actual.
    await page.goto('/superadmin/uso?mes=2099-01');
    await expect(mes).toContainText(nombreDelMes(hoy()));
  });

  test('la tabla por negocio se ordena por columna', async ({ page }, info) => {
    test.skip(info.project.name === 'celular', 'La tabla es del PC; en el celular se ordena con pastillas (prueba siguiente)');
    await abrirUso(page);
    const tabla = page.getByRole('region', { name: 'Por negocio' }).getByRole('table');
    const fila = (nombre: string) => tabla.getByRole('row').filter({ hasText: nombre });
    await expect(fila('Barbería E2E')).toContainText('42 de 50 · 84%');
    await expect(fila('Barbería E2E')).toContainText('$2.120');
    await expect(fila('Barbería E2E')).toContainText('$47.880');
    await expect(fila('Uso E2E Prueba')).toContainText('Sin plan');
    await expect(fila('Uso E2E Activa')).toContainText('Nunca');
    await expect(fila('Barbería E2E')).toContainText(/3 automáticos\d+ de servicio/);

    await tabla.getByRole('link', { name: 'Asistente' }).click();
    await expect(page).toHaveURL(/orden=ia&dir=desc/);
    await expect(tabla.getByRole('columnheader', { name: 'Asistente' })).toHaveAttribute('aria-sort', 'descending');
    // El de mayor porcentaje del plan, primero.
    await expect(tabla.getByRole('row').nth(1)).toContainText('Barbería E2E');
    await tabla.getByRole('link', { name: 'Asistente' }).click();
    await expect(page).toHaveURL(/orden=ia&dir=asc/);
    await expect(tabla.getByRole('columnheader', { name: 'Asistente' })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('en el celular, la lista por negocio se ordena con las pastillas', async ({ page }, info) => {
    test.skip(info.project.name !== 'celular', 'En el PC se ordena con los encabezados de la tabla');
    await abrirUso(page);
    const lista = page.getByRole('region', { name: 'Por negocio' }).getByRole('list', { name: 'Negocios' });
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).toContainText('Asistente 42 de 50 · 84%');
    await page.getByRole('navigation', { name: 'Ordenar negocios' }).getByRole('link', { name: 'Asistente' }).click();
    await expect(page).toHaveURL(/orden=ia&dir=desc/);
    await expect(lista.getByRole('link').first()).toContainText('Barbería E2E');
  });

  test('el detalle de un negocio muestra su plan, sus citas, sus derivaciones y su costo', async ({ page }) => {
    await abrirUso(page);
    await page.getByRole('list', { name: 'Alertas' }).getByRole('link', { name: /Barbería E2E/ }).click();
    await expect(page).toHaveURL(/\/superadmin\/uso\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Barbería E2E' })).toBeVisible();
    await expect(page.getByText('Plan Prueba E2E · $50.000 al mes')).toBeVisible();

    const asistente = page.getByRole('region', { name: 'Asistente' });
    await expect(asistente).toContainText('42 de 50 conversaciones · 84%');
    await expect(asistente.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '84');
    await expect(asistente).toContainText('Cerca del límite: candidato a subir de plan.');

    await expect(page.getByRole('list', { name: 'Citas por estado' })).toContainText('Pendientes');
    // Dos conversaciones sembradas se derivaron: se ve el motivo, nunca lo que escribió el cliente.
    const derivaciones = page.getByRole('region', { name: 'Derivaciones a una persona' });
    await expect(derivaciones.getByRole('list', { name: 'Derivaciones por motivo' })).toContainText('Pidió hablar con una persona');
    await expect(derivaciones).not.toContainText('Quiere hablar con una persona');

    const costo = page.getByRole('region', { name: 'Actividad y costo' });
    await expect(costo).toContainText('Mensajes de servicio$0');
    await expect(costo).toContainText('Costo estimado del mes$2.120');
    const envios = page.getByRole('region', { name: 'Mensajes de WhatsApp y entregas' });
    await expect(envios).toContainText(/Mensajes de servicio enviados\d+/);
    await expect(envios).toContainText('De servicio, se cobran0');
    await expect(costo).toContainText('Margen frente al plan ($50.000)$47.880');

    // De vuelta al resumen y a la ficha del negocio.
    await page.getByRole('link', { name: 'Ficha del negocio' }).click();
    await expect(page).toHaveURL(/\/superadmin\/negocios\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: 'Uso del mes' }).click();
    await expect(page.getByRole('region', { name: 'Asistente' })).toBeVisible();
    await page.getByRole('link', { name: 'Uso', exact: true }).first().click();
    await expect(page).toHaveURL('/superadmin/uso');
  });

  test('un negocio que no existe responde 404', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    const r = await page.goto('/superadmin/uso/00000000-0000-4000-8000-000000000000');
    expect(r?.status()).toBe(404);
  });

  test('ninguna pantalla de uso muestra datos de los clientes finales', async ({ page }) => {
    await abrirUso(page);
    const sinDatosDeClientes = async () => {
      const texto = await page.locator('main').innerText();
      // Nombres y mensajes de las conversaciones sembradas, y cualquier teléfono colombiano.
      for (const privado of ['Cliente Antiguo', 'Cliente Con Asistente', '¿siguen abiertos?', 'Quiero un corte mañana']) expect(texto).not.toContain(privado);
      expect(texto).not.toMatch(/\b57 ?3\d{2} ?\d{3} ?\d{4}\b|\b3\d{2} \d{3} \d{4}\b/);
    };
    await sinDatosDeClientes();
    await page.getByRole('list', { name: 'Alertas' }).getByRole('link', { name: /Barbería E2E/ }).click();
    await expect(page.getByRole('region', { name: 'Asistente' })).toBeVisible();
    await sinDatosDeClientes();
  });

  test('el dueño y el barbero no entran: vuelven a su inicio', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/superadmin/uso');
    await expect(page).toHaveURL('/hoy');
    await page.goto('/superadmin/uso/00000000-0000-4000-8000-000000000000');
    await expect(page).toHaveURL('/hoy');
    // La ficha del negocio tampoco: sale antes de pedirle nada al backend.
    await page.goto('/superadmin/negocios/00000000-0000-4000-8000-000000000000');
    await expect(page).toHaveURL('/hoy');
  });
});
