import { expect, test, type Page } from '@playwright/test';
import { alerta, datos, entrarYEsperar } from './datos';

/**
 * Ajustes del negocio (app/(panel)/negocio): secciones con ?seccion=, la lista del celular, la
 * barra Guardar/Descartar, el guardado en dos partes, las confirmaciones y el aviso al salir.
 * Lo que cambia, lo deja como estaba: otras pruebas dependen de la zona y del intervalo.
 */

const barra = (page: Page) => page.getByRole('region', { name: 'Cambios sin guardar' });
const pestanas = (page: Page) => page.getByRole('navigation', { name: 'Secciones de ajustes' });
const titulo = (page: Page, texto: string) => page.getByRole('heading', { level: 2, name: texto });
const salirSinGuardar = (page: Page) => page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });

async function abrir(page: Page, seccion?: string) {
  await entrarYEsperar(page, datos().dueno);
  await page.goto(seccion ? `/negocio?seccion=${seccion}` : '/negocio');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes del negocio' })).toBeAttached();
}

test.describe('escritorio y tablet: pestañas', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'escritorio', 'Pestañas: desde 768 px'));

  test('cada sección en su pestaña, con ?seccion= enlazable; cambiar de pestaña no pierde lo escrito', async ({ page }) => {
    await abrir(page);
    await expect(pestanas(page).getByRole('link', { name: 'Datos del negocio' })).toHaveAttribute('aria-current', 'page');
    await expect(titulo(page, 'Datos del negocio')).toBeVisible();
    await expect(titulo(page, 'Recordatorios')).toBeHidden();

    await page.getByLabel('Nombre', { exact: true }).fill('Barbería E2E cambiada');
    await pestanas(page).getByRole('link', { name: 'Recordatorios' }).click();
    await expect(page).toHaveURL('/negocio?seccion=recordatorios');
    await expect(titulo(page, 'Recordatorios')).toBeVisible();
    await expect(titulo(page, 'Datos del negocio')).toBeHidden();
    // Cambiar de sección no pregunta (es el mismo formulario) y la pestaña marca lo pendiente.
    await expect(salirSinGuardar(page)).toHaveCount(0);
    await expect(pestanas(page).getByRole('link', { name: /Datos del negocio.*con cambios sin guardar/ })).toBeVisible();
    await pestanas(page).getByRole('link', { name: /Datos del negocio/ }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Barbería E2E cambiada');
    await barra(page).getByRole('button', { name: 'Descartar' }).click();

    await page.goto('/negocio?seccion=agenda');
    await expect(titulo(page, 'Agenda')).toBeVisible();
    await page.goto('/negocio?seccion=no-existe');
    await expect(titulo(page, 'Datos del negocio')).toBeVisible();
  });

  test('a 768 px ya hay pestañas, no la lista', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await abrir(page);
    await expect(pestanas(page)).toHaveCount(1);
    await expect(pestanas(page).getByRole('link', { name: 'Agenda' })).toBeVisible();
    await expect(titulo(page, 'Datos del negocio')).toBeVisible();
  });

  test('la barra aparece solo con cambios y se va al dejar el valor como estaba', async ({ page }) => {
    await abrir(page, 'recordatorios');
    await expect(barra(page)).toHaveCount(0);
    const horas = page.getByLabel('Recordar la cita (horas antes)');
    const antes = await horas.inputValue();
    await horas.fill(String(Number(antes) + 1));
    await expect(barra(page)).toContainText('1 cambio sin guardar');
    await page.getByLabel('Ni después de las').fill('20:30');
    await expect(barra(page)).toContainText('2 cambios sin guardar');
    await horas.fill(antes);
    await page.getByLabel('Ni después de las').fill('21:00');
    await expect(barra(page)).toHaveCount(0);
  });

  test('un solo Guardar guarda cambios de dos secciones; Descartar vuelve a lo guardado', async ({ page }) => {
    await abrir(page);
    await page.getByLabel('WhatsApp para avisos').fill('300 123 4567');
    await pestanas(page).getByRole('link', { name: 'Recordatorios' }).click();
    const horas = page.getByLabel('Recordar la cita (horas antes)');
    await horas.fill('12');
    await expect(barra(page)).toContainText('2 cambios sin guardar');
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados.' })).toBeVisible();
    await expect(barra(page)).toHaveCount(0);
    // Al guardar se quita la entrada del aviso al salir; la dirección sigue en la sección que se ve.
    await expect(page).toHaveURL('/negocio?seccion=recordatorios');

    await page.reload();
    await expect(page.getByLabel('Recordar la cita (horas antes)')).toHaveValue('12');
    await pestanas(page).getByRole('link', { name: 'Datos del negocio' }).click();
    // El backend lo deja con indicativo, y así queda en el campo.
    await expect(page.getByLabel('WhatsApp para avisos')).toHaveValue('+573001234567');

    await page.getByLabel('WhatsApp para avisos').fill('');
    await expect(barra(page)).toBeVisible();
    await barra(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByLabel('WhatsApp para avisos')).toHaveValue('+573001234567');
    await expect(barra(page)).toHaveCount(0);
  });

  test('si una parte falla, dice qué se guardó, conserva lo escrito y reintenta solo lo pendiente', async ({ page }) => {
    await abrir(page);
    // El WhatsApp de avisos y no el nombre: la siembra de e2e busca el negocio por su nombre.
    const avisos = page.getByLabel('WhatsApp para avisos');
    const avisosAntes = await avisos.inputValue();
    await avisos.fill('+573009998877');
    await pestanas(page).getByRole('link', { name: 'Recordatorios' }).click();
    const desde = page.getByLabel('No enviar antes de las');
    const desdeAntes = await desde.inputValue();
    // Más tarde que "Ni después de las": el backend lo rechaza.
    await desde.fill('22:00');
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(alerta(page)).toContainText('Se guardaron los datos del negocio, pero no las reglas:');
    await expect(alerta(page)).toContainText('El horario de recordatorios debe empezar antes de terminar');
    await expect(desde).toHaveValue('22:00');
    // Lo de Datos ya quedó guardado: solo queda pendiente Recordatorios.
    await expect(barra(page).getByRole('button', { name: 'Reintentar' })).toBeVisible();
    await expect(pestanas(page).getByRole('link', { name: /Datos del negocio.*con cambios/ })).toHaveCount(0);
    await expect(pestanas(page).getByRole('link', { name: /Recordatorios.*con cambios/ })).toBeVisible();

    await desde.fill(desdeAntes);
    await expect(barra(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('WhatsApp para avisos')).toHaveValue('+573009998877');

    // Reintentar: una regla mala y luego corregida.
    await pestanas(page).getByRole('link', { name: 'Recordatorios' }).click();
    await desde.fill('22:00');
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(alerta(page)).toContainText('No se guardó:');
    await desde.fill('06:30');
    await barra(page).getByRole('button', { name: 'Reintentar' }).click();
    await expect(barra(page)).toHaveCount(0);
    await page.reload();
    await expect(desde).toHaveValue('06:30');

    // Como estaba.
    await desde.fill(desdeAntes);
    await pestanas(page).getByRole('link', { name: 'Datos del negocio' }).click();
    await page.getByLabel('WhatsApp para avisos').fill(avisosAntes);
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(barra(page)).toHaveCount(0);
  });

  test('un número fuera de rango lleva a su sección y no envía nada', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.getByLabel('Agendar como máximo con (días)').fill('999');
    await pestanas(page).getByRole('link', { name: 'Datos del negocio' }).click();
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL('/negocio?seccion=agenda');
    await expect(titulo(page, 'Agenda')).toBeVisible();
    await expect(barra(page)).toContainText('1 cambio sin guardar');
    await barra(page).getByRole('button', { name: 'Descartar' }).click();
  });

  test('la línea "Con esto" de Cancelaciones y Recordatorios sigue lo que se escribe', async ({ page }) => {
    await abrir(page, 'cancelaciones');
    await page.getByLabel('El cliente cancela hasta (horas antes)').fill('3');
    await page.getByLabel('Inasistencias permitidas (veces)').fill('2');
    await page.getByLabel('Se cuentan las de los últimos (días)').fill('60');
    await expect(page.getByText('Con esto: el cliente puede cancelar o cambiar su cita por WhatsApp hasta 3 horas antes. Si falta a más de 2 citas en 60 días, el asistente ya no le agenda solo.', { exact: true })).toBeVisible();
    await barra(page).getByRole('button', { name: 'Descartar' }).click();

    await pestanas(page).getByRole('link', { name: 'Recordatorios' }).click();
    await page.getByLabel('Recordar la cita (horas antes)').fill('24');
    await page.getByLabel('No enviar antes de las').fill('07:00');
    await page.getByLabel('Ni después de las').fill('21:00');
    await expect(page.getByText('Con esto: una cita de las 9:00 a. m. lo recibe el día anterior a las 9:00 a. m.; una cita de las 4:00 p. m. lo recibe el día anterior a las 4:00 p. m.', { exact: true })).toBeVisible();
    await page.getByLabel('Recordar la cita (horas antes)').fill('11');
    // 9:00 − 11 h = 22:00 del día anterior: fuera del horario, al borde más cercano (21:00).
    await expect(page.getByText(/^Con esto: una cita de las 9:00 a\. m\. lo recibe el día anterior a las 9:00 p\. m\.; una cita de las 4:00 p\. m\. lo recibe el mismo día a las 7:00 a\. m\.$/)).toBeVisible();
    await barra(page).getByRole('button', { name: 'Descartar' }).click();
  });

  test('cambiar la zona horaria pide confirmar, con cuánto se corren las citas; Cancelar no guarda', async ({ page }) => {
    await abrir(page);
    await page.getByLabel('Zona horaria').selectOption('America/Mexico_City');
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    const confirmar = page.getByRole('alertdialog', { name: '¿Cambiar la zona horaria?' });
    await expect(confirmar).toContainText('se verán 1 h antes (la de las 10:00 a. m. pasa a las 9:00 a. m.)');
    await expect(confirmar).toContainText('El horario de los barberos queda igual.');
    await confirmar.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmar).toBeHidden();
    await expect(barra(page).getByRole('button', { name: 'Guardar' })).toBeFocused();
    await page.reload();
    await expect(page.getByLabel('Zona horaria')).toHaveValue('America/Bogota');
  });

  test('cambiar el intervalo pide confirmar y luego guarda', async ({ page }) => {
    await abrir(page, 'agenda');
    const intervalo = page.getByLabel('Horas que se ofrecen cada');
    const antes = await intervalo.inputValue();
    const confirmar = page.getByRole('alertdialog', { name: '¿Cambiar el intervalo de la agenda?' });
    await intervalo.selectOption('30');
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await expect(confirmar).toContainText('Las citas ya agendadas no se mueven.');
    await confirmar.getByRole('button', { name: 'Guardar' }).click();
    await expect(barra(page)).toHaveCount(0);
    await page.reload();
    await expect(intervalo).toHaveValue('30');

    // Como estaba.
    await intervalo.selectOption(antes);
    await barra(page).getByRole('button', { name: 'Guardar' }).click();
    await confirmar.getByRole('button', { name: 'Guardar' }).click();
    await expect(barra(page)).toHaveCount(0);
  });

  test('con cambios, salir por el menú pregunta; sin cambios, no', async ({ page }) => {
    await abrir(page, 'asistente');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Clientes' }).click();
    await expect(page).toHaveURL('/clientes');
    await page.goBack();
    await expect(page).toHaveURL('/negocio?seccion=asistente');

    await page.getByLabel('Cuando pasa a una persona, el asistente calla (horas)').fill('5');
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Clientes' }).click();
    await expect(salirSinGuardar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();

    // Otra pestaña y atrás: pregunta, y "Seguir editando" deja la dirección de la pestaña que se ve.
    await pestanas(page).getByRole('link', { name: 'Agenda' }).click();
    await page.goBack();
    await expect(salirSinGuardar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL('/negocio?seccion=agenda');
    await expect(titulo(page, 'Agenda')).toBeVisible();

    await page.goBack();
    await expect(salirSinGuardar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Salir sin guardar' }).click();
    // Lo anterior a Ajustes (se entró con la dirección escrita, después de /hoy).
    await expect(page).toHaveURL('/hoy');
  });
});

test.describe('celular: lista de secciones', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular', 'Lista: menos de 768 px'));

  test('la lista resume cada sección; cada una abre su pantalla y atrás vuelve a la lista', async ({ page }) => {
    await abrir(page);
    const lista = pestanas(page);
    await expect(lista.getByRole('link', { name: /Datos del negocio/ })).toContainText('Bogota');
    await expect(lista.getByRole('link', { name: /Agenda/ })).toContainText(/Cada \d+ min/);
    await expect(titulo(page, 'Datos del negocio')).toBeHidden();

    await lista.getByRole('link', { name: /Recordatorios/ }).click();
    await expect(page).toHaveURL('/negocio?seccion=recordatorios');
    await expect(titulo(page, 'Recordatorios')).toBeFocused();
    await expect(pestanas(page)).toHaveCount(0);

    // Atrás del celular: a la lista.
    await page.goBack();
    await expect(page).toHaveURL('/negocio');
    await expect(lista.getByRole('link', { name: /Recordatorios/ })).toBeFocused();

    // "‹ Ajustes" también.
    await lista.getByRole('link', { name: /Agenda/ }).click();
    await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
    await expect(page).toHaveURL('/negocio');
    await expect(lista).toBeVisible();

    // Entrando directo a una sección, "‹ Ajustes" lleva a la lista.
    await page.goto('/negocio?seccion=agenda');
    await page.getByRole('link', { name: 'Ajustes', exact: true }).click();
    await expect(page).toHaveURL('/negocio');
    await expect(lista).toBeVisible();
  });

  test('con cambios: la lista los marca, atrás a la lista no pregunta, salir de Ajustes sí', async ({ page }) => {
    await abrir(page);
    const lista = pestanas(page);
    await lista.getByRole('link', { name: /Citas por aprobar/ }).click();
    await page.getByLabel('Plazo para aprobar (horas)').fill('7');
    await expect(barra(page)).toContainText('1 cambio sin guardar');

    await page.goBack();
    await expect(page).toHaveURL('/negocio');
    await expect(salirSinGuardar(page)).toHaveCount(0);
    await expect(lista.getByRole('link', { name: /Citas por aprobar/ })).toContainText('Sin guardar');
    await expect(lista.getByRole('link', { name: /Citas por aprobar/ })).toContainText('7 horas para aprobar');
    // La barra sigue a la vista desde la lista.
    await expect(barra(page)).toBeVisible();

    await page.goBack();
    await expect(salirSinGuardar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await barra(page).getByRole('button', { name: 'Descartar' }).click();
    await expect(barra(page)).toHaveCount(0);
    await expect(lista.getByRole('link', { name: /Citas por aprobar/ })).not.toContainText('Sin guardar');
  });
});
