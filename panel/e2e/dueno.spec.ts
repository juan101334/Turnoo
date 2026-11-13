import { expect, test, type Page } from '@playwright/test';
import { alerta, datos, entrarYEsperar } from './datos';

/**
 * Vista del dueño: agenda del equipo, citas por aprobar y cambios a clientes (ver sembrar.ts).
 * "Cliente Aprobar" (Barbero E2E) vence en 2 h y ya vino 3 veces y faltó 1; "Cliente Rechazar"
 * (Barbero Dos), en 30 min, es nuevo. "Cliente Lote Aprobar Uno" y "Dos" vencen en 5 y 6 h: son para
 * "Aprobar todas", que va al final.
 */

const tarjeta = (page: Page, cliente: string) => page.getByRole('link', { name: new RegExp(cliente) });
const filtro = (page: Page) => page.getByRole('navigation', { name: 'Barbero' });
const porAprobarEnLaBarra = (page: Page) => page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: /^Por aprobar/ });

test.describe('agenda del equipo', () => {
  test('el dueño filtra por barbero; el filtro sigue al cambiar de día y en la nueva cita', async ({ page }) => {
    const { fecha } = datos().agenda;
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${fecha}`);
    await expect(tarjeta(page, 'Cliente De Otro')).toBeVisible();
    await expect(filtro(page).getByRole('link', { name: 'Todos' })).toHaveAttribute('aria-current', 'true');

    await filtro(page).getByRole('link', { name: 'Barbero Dos' }).click();
    await expect(page).toHaveURL(new RegExp(`/agenda\\?fecha=${fecha}&barbero=[0-9a-f-]{36}$`));
    await expect(tarjeta(page, 'Cliente De Otro')).toBeVisible();
    await expect(tarjeta(page, 'Cliente Futuro')).toHaveCount(0);
    await expect(filtro(page).getByRole('link', { name: 'Barbero Dos' })).toHaveAttribute('aria-current', 'true');
    const barbero = new URL(page.url()).searchParams.get('barbero');

    await expect(page.getByRole('link', { name: 'Nueva cita' })).toHaveAttribute('href', new RegExp(`barbero=${barbero}`));
    await page.getByRole('navigation', { name: 'Días' }).getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`barbero=${barbero}`));

    await filtro(page).getByRole('link', { name: 'Todos' }).click();
    await expect(page).not.toHaveURL(/barbero=/);
  });

  test('un barbero que no existe en el filtro se ignora y se ve todo el equipo', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().agenda.fecha}&barbero=../../negocio`);
    await expect(tarjeta(page, 'Cliente De Otro')).toBeVisible();
    await expect(tarjeta(page, 'Cliente Futuro')).toBeVisible();
  });

  test('el barbero no tiene filtro', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().agenda.fecha}`);
    await expect(tarjeta(page, 'Cliente Futuro')).toBeVisible();
    await expect(filtro(page)).toHaveCount(0);
  });
});

test.describe.serial('citas por aprobar', () => {
  test('la barra muestra cuántas hay y la lista pone primero la que vence antes', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar, 4 pendientes');
    await porAprobarEnLaBarra(page).click();
    await expect(page.getByRole('heading', { name: 'Por aprobar' })).toBeVisible();

    const tarjetas = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Aprobar', exact: true }) });
    await expect(tarjetas).toHaveCount(4);
    await expect(tarjetas.nth(0)).toContainText('Cliente Rechazar');
    await expect(tarjetas.nth(0)).toContainText(/Vence en \d{1,2} min/);
    await expect(tarjetas.nth(1)).toContainText('Cliente Aprobar');
    await expect(tarjetas.nth(1)).toContainText(/Vence en 1 h \d{1,2} min|Vence en 2 h/);
  });

  test('cada tarjeta dice si el cliente es nuevo o cuántas veces vino y faltó', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/por-aprobar');
    const rechazar = page.getByRole('listitem').filter({ hasText: 'Cliente Rechazar' });
    await expect(rechazar).toContainText('Cliente nuevo');
    await expect(rechazar).not.toContainText('No vino');
    const aprobar = page.getByRole('listitem').filter({ hasText: 'Cliente Aprobar' });
    await expect(aprobar).toContainText('Ha venido 3 veces');
    await expect(aprobar).toContainText('No vino 1 vez');
  });

  test('aprobar se puede deshacer: la cita vuelve y el backend no la aprueba', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/por-aprobar');
    // install() deja correr el tiempo: se pausa para que los 7 s de deshacer no se acaben solos.
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const tarjeta = page.getByRole('listitem').filter({ hasText: 'Cliente Aprobar' });
    await tarjeta.getByRole('button', { name: 'Aprobar' }).click();
    await expect(tarjeta).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Aprobada: Cliente Aprobar.' }).getByRole('button', { name: 'Deshacer' }).click();
    await expect(tarjeta.getByRole('button', { name: 'Aprobar' })).toBeVisible();

    // Con el reloj quieto la página no termina de cargar: se reanuda antes de recargar.
    await page.clock.resume();
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'Cliente Aprobar' })).toHaveCount(1);
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar, 4 pendientes');
  });

  test('aprobar la quita de la lista al instante y, al acabar el aviso, baja el contador', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/por-aprobar');
    await page.waitForLoadState('networkidle');
    await page.getByRole('listitem').filter({ hasText: 'Cliente Aprobar' }).getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Cliente Aprobar' })).toHaveCount(0);

    const guardado = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/por-aprobar'));
    await page.clock.fastForward('00:08');
    expect((await guardado).ok()).toBe(true);
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar, 3 pendientes');
  });

  test('rechazar pide confirmación', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/por-aprobar');
    const rechazar = page.getByRole('listitem').filter({ hasText: 'Cliente Rechazar' });
    await rechazar.getByRole('button', { name: 'Rechazar' }).click();
    await expect(rechazar.getByText('¿Rechazar esta cita?')).toBeVisible();
    await rechazar.getByRole('button', { name: 'Sí, rechazar' }).click();

    await expect(rechazar).toHaveCount(0);
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar, 2 pendientes');
  });

  test('"Aprobar todas" lista lo que aprueba con su historial; al confirmar, la lista y el contador quedan vacíos', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/por-aprobar');
    await expect(page.getByText(/2 citas\s*esperan tu aprobación/)).toBeVisible();

    // Cancelar no aprueba nada.
    await page.getByRole('button', { name: 'Aprobar todas' }).click();
    const dialogo = page.getByRole('alertdialog', { name: '¿Aprobar 2 citas?' });
    const lista = dialogo.getByRole('list', { name: 'Citas que se aprueban' });
    await expect(lista.getByRole('listitem')).toHaveCount(2);
    // Como en la tarjeta: el día con mayúscula, "·", la hora, el cliente, el barbero y su historial.
    await expect(lista.getByRole('listitem').nth(0)).toContainText(/^[A-ZÁÉÍÓÚ].* · 10:00\sa\.\sm\. · Cliente Lote Aprobar Uno · Barbero E2E\s*Cliente nuevo$/);
    await expect(lista.getByRole('listitem').nth(1)).toContainText('Cliente Lote Aprobar Dos · Barbero Dos');
    await expect(dialogo).toContainText('Cada cliente recibe por WhatsApp');
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar, 2 pendientes');

    await page.getByRole('button', { name: 'Aprobar todas' }).click();
    await dialogo.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '2 citas aprobadas.' })).toBeVisible();
    await expect(page.getByText('No hay citas esperando tu aprobación.')).toBeVisible();
    await expect(porAprobarEnLaBarra(page)).toHaveAccessibleName('Por aprobar');
  });
});

test.describe('cambios a clientes', () => {
  test('el barbero no ve "Editar" ni "Borrar datos", y la página de editar no existe para él', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/clientes?buscar=Cliente Pasado');
    await page.getByRole('link', { name: /Cliente Pasado/ }).click();
    await expect(page.getByRole('heading', { name: 'Cliente Pasado' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Borrar datos del cliente' })).toHaveCount(0);

    await page.goto(`${page.url()}/editar`);
    await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
  });

  test('el dueño edita nombre, teléfono y notas; un teléfono inválido muestra el error del backend', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/clientes/${datos().clientes.editable}`);
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar cliente' })).toBeVisible();

    await page.getByLabel('Teléfono (WhatsApp)').fill('123');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(alerta(page)).toContainText('El teléfono debe tener entre 8 y 15 dígitos');

    await page.getByLabel('Nombre').fill('Cliente Editado');
    await page.getByLabel('Teléfono (WhatsApp)').fill('300 111 2233');
    await page.getByLabel('Notas').fill('Prefiere la máquina en 2');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page).toHaveURL(`/clientes/${datos().clientes.editable}`);
    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cliente Editado' })).toBeVisible();
    await expect(page.getByText('+57 300 111 2233')).toBeVisible();
    await expect(page.getByText('Prefiere la máquina en 2')).toBeVisible();
  });

  test('no se borran los datos de un cliente con citas activas', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes?buscar=Cliente De Otro');
    await page.getByRole('link', { name: /Cliente De Otro/ }).click();
    await page.getByRole('button', { name: 'Borrar datos del cliente' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(alerta(page)).toContainText('cita(s) activa(s)');
    await expect(page.getByRole('heading', { name: 'Cliente De Otro' })).toBeVisible();
  });

  test('borrar los datos pide confirmación y deja al cliente anonimizado', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/clientes/${datos().clientes.borrable}`);
    await page.getByRole('button', { name: 'Borrar datos del cliente' }).click();
    await expect(page.getByText('No se puede deshacer.')).toBeVisible();
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByRole('heading', { name: 'Cliente Borrable' })).toBeVisible();

    await page.getByRole('button', { name: 'Borrar datos del cliente' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByText('Se borraron los datos del cliente.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cliente anonimizado' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
  });
});
