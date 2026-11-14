import { expect, test, type Locator, type Page } from '@playwright/test';
import { alerta, datos, entrar, entrarYEsperar } from './datos';

/**
 * Administración del dueño: barberos, servicios, horarios, usuarios y ajustes (ver sembrar.ts).
 * Corre en orden: "Barbero Admin" se crea en la primera prueba y lo usan las siguientes.
 */

const seccion = (page: Page, titulo: string) => page.getByRole('region', { name: titulo });
/** El aviso breve que confirma lo que se hizo (abajo de la pantalla). */
const aviso = (page: Page, texto: string) => page.getByRole('status').filter({ hasText: texto });

/** Día ISO (1 lunes ... 7 domingo) de una fecha AAAA-MM-DD. */
const diaIso = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Abre la ficha del barbero y, si se pide, una de sus pestañas (Servicios es la primera). */
async function abrirBarbero(page: Page, nombre: string, pestana?: 'Horario' | 'Acceso' | 'Datos') {
  await page.goto('/equipo');
  await page.getByRole('link', { name: new RegExp(`^${nombre}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
  if (pestana) {
    await page.getByRole('navigation', { name: 'Secciones del barbero' }).getByRole('link', { name: pestana }).click();
    await expect(page).toHaveURL(new RegExp(`pestana=${pestana.toLowerCase()}`));
  }
}

/** Marca un día del horario tocando su botón (la casilla va oculta dentro); si ya estaba, lo deja. */
async function marcarDia(horario: Locator, dia: string) {
  const casilla = horario.getByRole('checkbox', { name: dia, exact: true });
  if (!(await casilla.isChecked())) await horario.locator('label').filter({ has: horario.page().getByRole('checkbox', { name: dia, exact: true }) }).click();
  await expect(casilla).toBeChecked();
}

/**
 * Abre un formulario plegado ("Nuevo servicio", "Nuevo horario"). Con la lista vacía ya viene
 * abierto, y entonces no hay botón: se deja así.
 */
async function abrirFormulario(zona: Page | Locator, boton: string) {
  const abrir = zona.getByRole('button', { name: boton });
  if ((await abrir.count()) > 0) await abrir.click();
}

/** Abre el menú "Acciones" de un usuario (si ya está abierto, lo deja así). */
async function abrirAcciones(fila: Locator) {
  const menu = fila.locator('details');
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) await fila.getByText('Acciones', { exact: true }).click();
}

test.describe.serial('barberos, servicios y horarios', () => {
  test('agregar un barbero lleva a su ficha', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/equipo');
    await page.getByRole('button', { name: 'Nuevo barbero' }).click();
    await page.getByLabel('Nombre').fill('Barbero Admin');
    await page.getByRole('button', { name: 'Agregar barbero' }).click();
    await expect(page).toHaveURL(/\/equipo\/[0-9a-f-]{36}\?listo=creado$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Barbero Admin' })).toBeVisible();
    await expect(page.getByText('Barbero agregado.')).toBeVisible();
  });

  test('con la lista llena, los formularios para agregar van plegados: "Nuevo …" abre y "Cancelar" cierra', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/equipo');
    const nuevoBarbero = page.getByRole('button', { name: 'Nuevo barbero' });
    await expect(nuevoBarbero).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Nombre')).toHaveCount(0);

    await abrirBarbero(page, 'Barbero Dos');
    const servicios = seccion(page, 'Servicios y precios');
    await expect(servicios.getByLabel('Nombre')).toHaveCount(0);
    await servicios.getByRole('button', { name: 'Nuevo servicio' }).click();
    const formulario = servicios.getByRole('group', { name: 'Agregar servicio' });
    await expect(formulario.getByLabel('Nombre')).toBeFocused();
    await formulario.getByRole('button', { name: 'Cancelar' }).click();
    await expect(servicios.getByLabel('Nombre')).toHaveCount(0);
    await expect(servicios.getByRole('button', { name: 'Nuevo servicio' })).toBeFocused();

    await page.getByRole('navigation', { name: 'Secciones del barbero' }).getByRole('link', { name: 'Horario' }).click();
    const horario = seccion(page, 'Horario semanal');
    await expect(horario.getByRole('button', { name: 'Nuevo horario' })).toBeVisible();
    await expect(horario.getByLabel('Desde')).toHaveCount(0);
  });

  test('servicios: agregar, validar, editar el precio y dejar de ofrecer', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin');
    const servicios = seccion(page, 'Servicios y precios');

    // Sin servicios, el formulario viene abierto: no hay nada más que hacer.
    await expect(servicios.getByRole('button', { name: 'Nuevo servicio' })).toHaveCount(0);
    await servicios.getByLabel('Nombre').fill('Cerquillo');
    await servicios.getByLabel('Duración (min)').fill('0');
    await servicios.getByLabel('Precio ($)').fill('18.000');
    await servicios.getByRole('button', { name: 'Agregar servicio' }).click();
    await expect(alerta(page)).toContainText('La duración va en minutos');

    await servicios.getByLabel('Nombre').fill('Cerquillo');
    await servicios.getByLabel('Duración (min)').fill('15');
    await servicios.getByLabel('Precio ($)').fill('18.000');
    await servicios.getByRole('button', { name: 'Agregar servicio' }).click();
    await expect(aviso(page, 'Servicio "Cerquillo" agregado.')).toBeVisible();
    await expect(servicios.getByText('15 min · $18.000')).toBeVisible();

    await servicios.getByRole('link', { name: 'Editar Cerquillo' }).click();
    await expect(page.getByRole('heading', { name: 'Editar servicio' })).toBeVisible();
    await expect(page.getByLabel('Precio ($)')).toHaveValue('18.000');
    await page.getByLabel('Precio ($)').fill('20000');
    await page.getByRole('button', { name: 'Guardar servicio' }).click();
    await expect(page.getByText('Servicio guardado.')).toBeVisible();
    await expect(servicios.getByText('15 min · $20.000')).toBeVisible();

    await servicios.getByRole('button', { name: 'Dejar de ofrecer' }).click();
    await expect(servicios.getByText('15 min · $20.000 · no se ofrece')).toBeVisible();
    await servicios.getByRole('button', { name: 'Volver a ofrecer' }).click();
    await expect(servicios.getByText('15 min · $20.000', { exact: true })).toBeVisible();
  });

  test('horario: agregar un rango, rechazar uno al revés y quitarlo con confirmación', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin', 'Horario');
    const horario = seccion(page, 'Horario semanal');

    await abrirFormulario(horario, 'Nuevo horario');
    await marcarDia(horario, 'Lunes');
    await horario.getByLabel('Desde').fill('12:00');
    await horario.getByLabel('Hasta').fill('08:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(alerta(page)).toContainText('El horario debe empezar antes de terminar.');

    await marcarDia(horario, 'Lunes');
    await horario.getByLabel('Desde').fill('08:00');
    await horario.getByLabel('Hasta').fill('12:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(aviso(page, 'Lunes: 8:00 a. m. a 12:00 p. m. agregado.')).toBeVisible();

    const quitar = horario.getByRole('button', { name: 'Quitar Lunes de 8:00 a. m. a 12:00 p. m.' });
    await quitar.click();
    await expect(horario.getByText(/¿Quitar 8:00 a\. m\. a 12:00 p\. m\.\?/)).toBeVisible();
    await horario.getByRole('button', { name: 'Volver' }).click();
    await quitar.click();
    await horario.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(horario.getByText('Horario quitado.')).toBeVisible();
    await expect(quitar).toHaveCount(0);
  });

  test('horario: el mismo rango a varios días de una vez', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin', 'Horario');
    const horario = seccion(page, 'Horario semanal');
    await abrirFormulario(horario, 'Nuevo horario');
    await horario.getByRole('button', { name: 'De lunes a viernes' }).click();
    for (const dia of DIAS.slice(0, 5)) await expect(horario.getByRole('checkbox', { name: dia })).toBeChecked();
    await expect(horario.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked();
    await horario.getByLabel('Desde').fill('14:00');
    await horario.getByLabel('Hasta').fill('18:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(aviso(page, 'Lunes, Martes, Miércoles, Jueves y Viernes: 2:00 p. m. a 6:00 p. m. agregado.')).toBeVisible();
    for (const dia of DIAS.slice(0, 5)) await expect(horario.getByRole('button', { name: `Quitar ${dia} de 2:00 p. m. a 6:00 p. m.` })).toBeVisible();
    await expect(horario.getByRole('button', { name: 'Quitar Sábado de 2:00 p. m. a 6:00 p. m.' })).toHaveCount(0);
  });

  test('quitar un horario con citas avisa cuáles quedaron fuera, sin cancelarlas', async ({ page }) => {
    const dia = DIAS[diaIso(datos().agenda.fecha) - 1]!;
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Dos', 'Horario');
    const horario = seccion(page, 'Horario semanal');

    await horario.getByRole('button', { name: `Quitar ${dia} de 8:00 a. m. a 8:00 p. m.` }).click();
    await horario.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(horario.getByText('Estas citas quedaron fuera del horario y siguen agendadas:')).toBeVisible();
    await expect(horario.getByRole('link', { name: /10:00 a\. m\. · Cliente De Otro/ })).toBeVisible();

    // Se devuelve el horario para no cambiar la agenda que usan las otras pruebas.
    await abrirFormulario(horario, 'Nuevo horario');
    await marcarDia(horario, dia);
    await horario.getByLabel('Desde').fill('08:00');
    await horario.getByLabel('Hasta').fill('20:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(horario.getByRole('button', { name: `Quitar ${dia} de 8:00 a. m. a 8:00 p. m.` })).toBeVisible();
  });

  test('un barbero con citas futuras no se desactiva; uno sin citas sí, y se reactiva', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Dos', 'Datos');
    await page.getByRole('button', { name: 'Desactivar barbero' }).click();
    await page.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(alerta(page)).toContainText(/citas? futuras?/);

    await abrirBarbero(page, 'Barbero Admin', 'Datos');
    await page.getByRole('button', { name: 'Desactivar barbero' }).click();
    await expect(page.getByText('¿Desactivar a Barbero Admin?')).toBeVisible();
    await page.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(page.getByText('Inactivo: no aparece para agendar.')).toBeVisible();
    await page.getByRole('button', { name: 'Activar barbero' }).click();
    await expect(page.getByRole('button', { name: 'Desactivar barbero' })).toBeVisible();
  });

  test('acceso al panel: asignar y quitar el usuario del barbero', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin', 'Acceso');
    const acceso = seccion(page, 'Acceso al panel');
    await acceso.getByLabel('Usuario').selectOption({ label: 'Dueño E2E (dueño)' });
    await acceso.getByRole('button', { name: 'Guardar acceso' }).click();
    await expect(aviso(page, 'Usuario asignado.')).toBeVisible();
    await page.goto('/equipo');
    await expect(page.getByRole('link', { name: /Barbero Admin/ })).toContainText('Entra al panel: Dueño E2E');

    await abrirBarbero(page, 'Barbero Admin', 'Acceso');
    await acceso.getByLabel('Usuario').selectOption('');
    await acceso.getByRole('button', { name: 'Guardar acceso' }).click();
    await expect(aviso(page, 'El barbero quedó sin usuario.')).toBeVisible();
  });
});

test.describe.serial('usuarios e invitaciones', () => {
  const correo = `invitado-admin-${Date.now()}@e2e.turnoo.test`;

  test('la lista muestra rol y estado; uno mismo no tiene "Desactivar"', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/usuarios');
    const yo = page.getByRole('listitem').filter({ hasText: '(tú)' });
    await expect(yo).toContainText('Dueño');
    // A uno mismo no hay nada que hacerle: sin menú de acciones.
    await expect(yo.getByText('Acciones', { exact: true })).toHaveCount(0);
    const barbero = page.getByRole('listitem').filter({ hasText: datos().empleado });
    await expect(barbero).toContainText('Activo');
    await expect(barbero).toContainText('atiende como Barbero E2E');
    // Las acciones van plegadas hasta abrir el menú.
    await expect(barbero.getByRole('button', { name: 'Desactivar' })).toBeHidden();
    await abrirAcciones(barbero);
    await expect(barbero.getByRole('button', { name: 'Desactivar' })).toBeVisible();
  });

  test('invitar a un barbero da un enlace para compartir que sí sirve para entrar', async ({ page, browser }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/usuarios');
    await page.getByRole('link', { name: 'Invitar' }).click();
    await page.getByLabel('Nombre').fill('Barbero Invitado');
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Atiende como').selectOption({ label: 'Barbero Admin' });
    await page.getByRole('button', { name: 'Crear enlace de invitación' }).click();

    const enlace = page.getByLabel('Enlace listo. Envíaselo solo a esa persona.');
    await expect(enlace).toHaveValue(/^http:\/\/localhost:3101\/aceptar-invitacion#token=/);
    const url = await enlace.inputValue();
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(`Te invito al panel de Barbería E2E en Turnoo. Entra aquí y crea tu contraseña:\n${url}\n\nEl enlace sirve una sola vez.`)}`);
    expect(page.url()).not.toContain('token');

    const otro = await browser.newPage();
    await otro.goto(url);
    await otro.getByLabel('Contraseña nueva').fill('clave-invitado-123');
    await otro.getByLabel('Repite la contraseña').fill('clave-invitado-123');
    await otro.getByRole('button', { name: 'Crear contraseña' }).click();
    await expect(otro).toHaveURL('/login?listo=invitacion');
    await entrar(otro, correo, 'clave-invitado-123');
    await expect(otro).toHaveURL('/hoy');
    await otro.close();
  });

  test('a un barbero activo se le da un enlace para nueva contraseña', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/usuarios');
    const invitado = page.getByRole('listitem').filter({ hasText: correo });
    await expect(invitado).toContainText('Activo');
    await abrirAcciones(invitado);
    await invitado.getByRole('button', { name: 'Enlace para nueva contraseña' }).click();
    await expect(invitado.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/restablecer-contrasena#token=/);
  });

  test('desactivar pide confirmación y deja el usuario desactivado, con opción de reinvitarlo', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/usuarios');
    const invitado = page.getByRole('listitem').filter({ hasText: correo });
    await abrirAcciones(invitado);
    await invitado.getByRole('button', { name: 'Desactivar' }).click();
    await expect(invitado.getByText('¿Desactivar a Barbero Invitado?')).toBeVisible();
    await invitado.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(invitado).toContainText('Desactivado');
    await abrirAcciones(invitado);
    await invitado.getByRole('button', { name: 'Reenviar invitación' }).click();
    await expect(invitado.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/aceptar-invitacion#token=/);
  });
});
