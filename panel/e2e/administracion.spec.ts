import { expect, test, type Page } from '@playwright/test';
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

async function abrirBarbero(page: Page, nombre: string) {
  await page.goto('/equipo');
  await page.getByRole('link', { name: new RegExp(`^${nombre}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
}

test.describe.serial('barberos, servicios y horarios', () => {
  test('agregar un barbero lleva a su ficha', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/equipo');
    await page.getByLabel('Nombre').fill('Barbero Admin');
    await page.getByRole('button', { name: 'Agregar barbero' }).click();
    await expect(page).toHaveURL(/\/equipo\/[0-9a-f-]{36}\?listo=creado$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Barbero Admin' })).toBeVisible();
    await expect(page.getByText('Barbero agregado.')).toBeVisible();
  });

  test('servicios: agregar, validar, editar el precio y dejar de ofrecer', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin');
    const servicios = seccion(page, 'Servicios y precios');

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
    await abrirBarbero(page, 'Barbero Admin');
    const horario = seccion(page, 'Horario semanal');

    await horario.getByLabel('Día').selectOption('Lunes');
    await horario.getByLabel('Desde').fill('12:00');
    await horario.getByLabel('Hasta').fill('08:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(alerta(page)).toContainText('El horario debe empezar antes de terminar.');

    await horario.getByLabel('Día').selectOption('Lunes');
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

  test('quitar un horario con citas avisa cuáles quedaron fuera, sin cancelarlas', async ({ page }) => {
    const dia = DIAS[diaIso(datos().agenda.fecha) - 1]!;
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Dos');
    const horario = seccion(page, 'Horario semanal');

    await horario.getByRole('button', { name: `Quitar ${dia} de 8:00 a. m. a 8:00 p. m.` }).click();
    await horario.getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(horario.getByText('Estas citas quedaron fuera del horario y siguen agendadas:')).toBeVisible();
    await expect(horario.getByRole('link', { name: /10:00 a\. m\. · Cliente De Otro/ })).toBeVisible();

    // Se devuelve el horario para no cambiar la agenda que usan las otras pruebas.
    await horario.getByLabel('Día').selectOption(dia);
    await horario.getByLabel('Desde').fill('08:00');
    await horario.getByLabel('Hasta').fill('20:00');
    await horario.getByRole('button', { name: 'Agregar horario' }).click();
    await expect(horario.getByRole('button', { name: `Quitar ${dia} de 8:00 a. m. a 8:00 p. m.` })).toBeVisible();
  });

  test('un barbero con citas futuras no se desactiva; uno sin citas sí, y se reactiva', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Dos');
    await page.getByRole('button', { name: 'Desactivar barbero' }).click();
    await page.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(alerta(page)).toContainText(/citas? futuras?/);

    await abrirBarbero(page, 'Barbero Admin');
    await page.getByRole('button', { name: 'Desactivar barbero' }).click();
    await expect(page.getByText('¿Desactivar a Barbero Admin?')).toBeVisible();
    await page.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(page.getByText('Inactivo: no aparece para agendar.')).toBeVisible();
    await page.getByRole('button', { name: 'Activar barbero' }).click();
    await expect(page.getByRole('button', { name: 'Desactivar barbero' })).toBeVisible();
  });

  test('acceso al panel: asignar y quitar el usuario del barbero', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await abrirBarbero(page, 'Barbero Admin');
    const acceso = seccion(page, 'Acceso al panel');
    await acceso.getByLabel('Usuario').selectOption({ label: 'Dueño E2E (dueño)' });
    await acceso.getByRole('button', { name: 'Guardar acceso' }).click();
    await expect(aviso(page, 'Usuario asignado.')).toBeVisible();
    await page.goto('/equipo');
    await expect(page.getByRole('link', { name: /Barbero Admin/ })).toContainText('Entra al panel: Dueño E2E');

    await abrirBarbero(page, 'Barbero Admin');
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
    await expect(yo.getByRole('button', { name: 'Desactivar' })).toHaveCount(0);
    const barbero = page.getByRole('listitem').filter({ hasText: datos().empleado });
    await expect(barbero).toContainText('Activo');
    await expect(barbero).toContainText('atiende como Barbero E2E');
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
    await invitado.getByRole('button', { name: 'Enlace para nueva contraseña' }).click();
    await expect(invitado.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/restablecer-contrasena#token=/);
  });

  test('desactivar pide confirmación y deja el usuario desactivado, con opción de reinvitarlo', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/usuarios');
    const invitado = page.getByRole('listitem').filter({ hasText: correo });
    await invitado.getByRole('button', { name: 'Desactivar' }).click();
    await expect(invitado.getByText('¿Desactivar a Barbero Invitado?')).toBeVisible();
    await invitado.getByRole('button', { name: 'Sí, desactivar' }).click();
    await expect(invitado).toContainText('Desactivado');
    await invitado.getByRole('button', { name: 'Reenviar invitación' }).click();
    await expect(invitado.getByLabel('Enlace listo. Envíaselo solo a esa persona.')).toHaveValue(/\/aceptar-invitacion#token=/);
  });
});

test.describe.serial('ajustes del negocio', () => {
  test('guardar el WhatsApp de avisos; el backend lo deja con indicativo', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/negocio');
    await expect(page.getByLabel('Zona horaria')).toHaveValue('America/Bogota');
    await page.getByLabel('WhatsApp para avisos').fill('300 123 4567');
    await page.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(page.getByText('Datos guardados.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('WhatsApp para avisos')).toHaveValue('+573001234567');
  });

  test('reglas: sin cambios no envía nada; un cambio se guarda; una regla incoherente muestra el error', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/negocio');
    await page.getByRole('button', { name: 'Guardar reglas' }).click();
    await expect(page.getByText('No había cambios para guardar.')).toBeVisible();

    await page.getByLabel('Recordar la cita (horas antes)').fill('12');
    await page.getByRole('button', { name: 'Guardar reglas' }).click();
    await expect(page.getByText('Reglas guardadas.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Recordar la cita (horas antes)')).toHaveValue('12');

    await page.getByLabel('No enviar antes de las').fill('21:00');
    await page.getByRole('button', { name: 'Guardar reglas' }).click();
    await expect(alerta(page)).toContainText('El horario de recordatorios debe empezar antes de terminar');
  });
});
