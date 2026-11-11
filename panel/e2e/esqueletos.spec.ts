import { expect, test, type Locator, type Page } from '@playwright/test';
import { BACKEND, datos, entrarYEsperar } from './datos';

/**
 * Esqueletos de carga: al tocar un enlace, la pantalla muestra enseguida la forma de lo que viene
 * y, cuando llega, nada salta. El backend de pruebas retiene los datos de la página (/__e2e/ en
 * backend/pruebas/e2e/servidor.ts) para mirar el esqueleto con calma; al soltarlos, el título y el
 * comienzo del contenido tienen que quedar donde estaban.
 */

/** Diferencia aceptada, en px: el esqueleto imita alturas, no pinta letras. */
const TOLERANCIA = 3;

interface Caso {
  ruta: string;
  /** Lo que la página le pide al backend y se retiene (el marco no se vuelve a pedir al navegar). */
  api: string;
  /** El h1 de la pantalla, si el esqueleto lo muestra escrito (no depende de los datos). */
  titulo?: string;
  /** Dónde empieza el contenido de verdad: lo que debe caer donde el esqueleto marcó. */
  contenido: (main: Locator) => Locator;
}

const CASOS: Caso[] = [
  { ruta: '/agenda', api: '/profesionales', contenido: (m) => m.locator('nav[aria-label="Días"]') },
  {
    ruta: '/por-aprobar',
    api: '/citas',
    titulo: 'Por aprobar',
    // Otras pruebas aprueban o rechazan las sembradas: puede tocar el aviso de "no hay".
    contenido: (m) => m.locator('ul, div.border-dashed').first(),
  },
  { ruta: '/mensajes', api: '/conversaciones', titulo: 'Mensajes', contenido: (m) => m.locator('nav[aria-label="Filtro de conversaciones"]') },
  { ruta: '/clientes', api: '/clientes', contenido: (m) => m.locator('table, ul').locator('visible=true').first() },
  { ruta: '/negocio', api: '/negocio', titulo: 'Ajustes del negocio', contenido: (m) => m.locator('nav[aria-label="Secciones de ajustes"]').locator('visible=true').first() },
  { ruta: '/equipo', api: '/profesionales', titulo: 'Barberos y servicios', contenido: (m) => m.locator('ul').first() },
  { ruta: '/usuarios', api: '/auth/usuarios', titulo: 'Usuarios', contenido: (m) => m.locator('ul').first() },
];

const freno = (page: Page, accion: string) => page.request.post(`${BACKEND}/__e2e/${accion}`);

// Si una prueba falla con los datos retenidos, que no se queden así para la siguiente.
test.afterEach(async ({ page }) => {
  await freno(page, 'soltar');
});

const arriba = async (l: Locator) => (await l.boundingBox())?.y ?? Number.NaN;

for (const caso of CASOS) {
  test(`esqueleto de ${caso.ruta}: aparece enseguida y el contenido llega donde lo marcó`, async ({ page }, info) => {
    const celular = info.project.name === 'celular';
    await entrarYEsperar(page, datos().dueno);
    // En el celular, lo que no está en la barra de abajo se abre desde "Más".
    if (celular) await page.goto('/mas');
    await freno(page, `retener?ruta=${encodeURIComponent(caso.api)}`);

    await page.locator(`a[href="${caso.ruta}"]`).locator('visible=true').first().click();
    const esqueleto = page.locator('[aria-busy="true"]');
    await expect(esqueleto).toBeVisible({ timeout: 15_000 });
    await expect(esqueleto.getByRole('status')).toHaveText('Cargando…');

    const marca = esqueleto.locator('[data-esqueleto="contenido"]').locator('visible=true').first();
    await expect(marca).toBeVisible();
    const contenidoAntes = await arriba(marca);
    const tituloEsqueleto = esqueleto.locator('p[aria-hidden="true"]').first();
    const tituloAntes = caso.titulo ? await arriba(tituloEsqueleto) : Number.NaN;
    if (caso.titulo) await expect(tituloEsqueleto).toHaveText(caso.titulo);

    await freno(page, 'soltar');
    await expect(esqueleto).toHaveCount(0, { timeout: 15_000 });
    const main = page.locator('main');
    const contenido = caso.contenido(main);
    await expect(contenido).toBeVisible();
    expect(Math.abs((await arriba(contenido)) - contenidoAntes), 'el contenido no salta').toBeLessThanOrEqual(TOLERANCIA);
    if (caso.titulo) {
      const h1 = main.getByRole('heading', { level: 1, name: caso.titulo });
      expect(Math.abs((await arriba(h1)) - tituloAntes), 'el título no salta').toBeLessThanOrEqual(TOLERANCIA);
    }
  });
}
