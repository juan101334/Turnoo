import { expect, test, type Page } from '@playwright/test';
import { BACKEND, COOKIE, datos, entrarYEsperar } from './datos';

/**
 * Búsqueda mientras se escribe (componentes/buscador-en-vivo.tsx), igual en Clientes, Nueva cita y
 * el superadmin: espera 300 ms desde la última letra, deja la búsqueda en la URL, descarta las
 * respuestas viejas y no distingue tildes ni mayúsculas.
 */

/** Peticiones de la pantalla (RSC) que llevan una búsqueda: una por cada búsqueda que se hizo. */
function contarBusquedas(page: Page) {
  const pedidas: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (r.headers()['rsc'] && url.searchParams.has('buscar')) pedidas.push(url.searchParams.get('buscar')!);
  });
  return pedidas;
}

test.describe('búsqueda en vivo', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular', 'Igual en todos los tamaños'));

  test('espera 300 ms desde la última letra: una sola búsqueda al terminar de escribir', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes');
    const pedidas = contarBusquedas(page);
    const campo = page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' });
    // Una letra cada 150 ms: la cuenta se reinicia con cada una y no busca a medias.
    await campo.pressSequentially('Futuro', { delay: 150 });
    await expect(page.locator('[data-buscando]')).toBeVisible();
    await expect(page).toHaveURL(/buscar=Futuro/);
    await expect(page.getByRole('link', { name: /Cliente Futuro/ }).first()).toBeVisible();
    await expect(page.locator('[data-buscando]')).toHaveCount(0);
    expect(pedidas).toEqual(['Futuro']);
    // El foco sigue en el campo: se puede seguir escribiendo.
    await expect(campo).toBeFocused();
  });

  test('no distingue tildes ni mayúsculas', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes');
    const campo = page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' });
    for (const texto of ['cliente rapido', 'CLIENTE RÁPIDO', 'Rápido']) {
      await campo.fill(texto);
      await expect(page).toHaveURL(new RegExp(`buscar=${encodeURIComponent(texto).replace(/%20/g, '(\\+|%20)')}$`));
      await expect(page.getByRole('link', { name: /Cliente Rápido/ }).first(), texto).toBeVisible();
    }
  });

  test('una búsqueda nueva vuelve a la primera página y conserva lo demás de la URL', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes?pagina=1');
    await page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' }).fill('Cliente');
    await expect(page).toHaveURL(/\/clientes\?buscar=Cliente$/);
    // Borrar la búsqueda la quita de la URL.
    await page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' }).fill('');
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test('descarta la respuesta vieja: si la primera búsqueda tarda, gana la última', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes');
    // La búsqueda "Futuro" tarda 2 s en volver; "Pasado", lo normal.
    await page.route(/\/clientes\?buscar=Futuro/, async (ruta) => {
      await new Promise((r) => setTimeout(r, 2000));
      await ruta.continue().catch(() => {});
    });
    const campo = page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' });
    await campo.fill('Futuro');
    await page.waitForTimeout(500); // ya pidió "Futuro"
    await campo.fill('Pasado');
    await expect(page).toHaveURL(/buscar=Pasado/);
    await expect(page.getByRole('link', { name: /Cliente Pasado/ }).first()).toBeVisible();
    // Cuando por fin llega "Futuro", no reemplaza a "Pasado".
    await page.waitForTimeout(2500);
    await expect(page).toHaveURL(/buscar=Pasado/);
    await expect(page.getByRole('link', { name: /Cliente Futuro/ })).toHaveCount(0);
    await expect(campo).toHaveValue('Pasado');
  });

  test('al volver atrás, el campo y los resultados siguen a la URL', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/clientes');
    await page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' }).fill('Futuro');
    await expect(page).toHaveURL(/buscar=Futuro/);
    await page.getByRole('link', { name: /Cliente Futuro/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cliente Futuro' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Buscar por nombre o teléfono' })).toHaveValue('Futuro');
  });

  test('Nueva cita ofrece los clientes recientes antes de buscar', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/citas/nueva');
    const recientes = page.getByRole('list', { name: 'Clientes recientes' });
    await expect(recientes.getByRole('link').first()).toBeVisible();
    // En el orden del backend para "reciente" (el último creado o agendado primero), no por nombre.
    const token = (await page.context().cookies()).find((c) => c.name === COOKIE)!.value;
    const delBackend = (await (
      await page.request.get(`${BACKEND}/clientes?orden=reciente&limite=8`, { headers: { authorization: `Bearer ${token}` } })
    ).json()) as { clientes: { nombre: string | null; telefono: string | null }[] };
    const esperados = delBackend.clientes.filter((c) => c.telefono).map((c) => c.nombre ?? '');
    const nombres = (await recientes.getByRole('link').allInnerTexts()).map((t) => t.split('\n')[0]!.trim());
    expect(nombres.length).toBeGreaterThan(1);
    expect(nombres.slice(0, 3)).toEqual(esperados.slice(0, 3).map((n) => n || expect.any(String)));
    await page.getByLabel('Buscar cliente por nombre o teléfono').fill('futuro');
    await expect(page.getByRole('list', { name: 'Clientes encontrados' }).getByRole('link', { name: /Cliente Futuro/ })).toBeVisible();
    await expect(recientes).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /clientes? encontrados?\./ })).toHaveCount(1);
  });
});

test.describe('superadmin: filtros de negocios', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular', 'Igual en todos los tamaños'));

  test('por estado y por WhatsApp, junto con la búsqueda sin tildes', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    const lista = page.getByRole('list', { name: 'Negocios' });
    await page.getByLabel('Buscar negocio por nombre').fill('BARBERIA E2E');
    await expect(page).toHaveURL(/buscar=BARBERIA(\+|%20)E2E$/);
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).toBeVisible();

    // Barbería E2E no está suspendida y tiene WhatsApp (la siembra le conecta un número).
    await page.getByRole('navigation', { name: 'Filtrar por estado' }).getByRole('link', { name: 'Suspendido' }).click();
    await expect(page).toHaveURL(/buscar=BARBERIA(\+|%20)E2E&estado=suspendido/);
    await expect(page.getByText('Ningún negocio coincide con la búsqueda y los filtros.')).toBeVisible();
    await page.getByRole('navigation', { name: 'Filtrar por estado' }).getByRole('link', { name: 'Todos' }).click();
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).toBeVisible();

    await page.getByRole('navigation', { name: 'Filtrar por whatsapp' }).getByRole('link', { name: 'Sin WhatsApp' }).click();
    await expect(page).toHaveURL(/whatsapp=no/);
    await expect(lista).toHaveCount(0);
    // "Ver todos" quita búsqueda y filtros, y el campo lo sigue aunque no se vuelva a montar.
    await page.getByRole('link', { name: 'Ver todos' }).click();
    await expect(page).toHaveURL(/\/superadmin$/);
    await expect(page.getByLabel('Buscar negocio por nombre')).toHaveValue('');
    await page.getByLabel('Buscar negocio por nombre').fill('BARBERIA E2E');
    await expect(page).toHaveURL(/buscar=BARBERIA(\+|%20)E2E$/);
    await page.getByRole('navigation', { name: 'Filtrar por whatsapp' }).getByRole('link', { name: 'Con WhatsApp' }).click();
    await expect(page).toHaveURL(/buscar=BARBERIA(\+|%20)E2E&whatsapp=si/);
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).toBeVisible();
    await expect(lista.getByRole('link', { name: /Barbería E2E/ })).not.toContainText('Sin WhatsApp');
    // El campo conserva la búsqueda al cambiar de filtro.
    await expect(page.getByLabel('Buscar negocio por nombre')).toHaveValue('BARBERIA E2E');

    // Con filtros, cada pastilla activa se marca.
    await expect(page.getByRole('navigation', { name: 'Filtrar por whatsapp' }).getByRole('link', { name: 'Con WhatsApp' })).toHaveAttribute('aria-current', 'true');
  });
});
