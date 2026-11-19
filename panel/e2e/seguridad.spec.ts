import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/** Junta las violaciones de CSP de la página: el evento del documento y el aviso de la consola. */
function vigilarCsp(page: Page): string[] {
  const violaciones: string[] = [];
  page.on('console', (mensaje) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(mensaje.text())) violaciones.push(mensaje.text());
  });
  page.on('pageerror', (error) => {
    if (/Content Security Policy/i.test(error.message)) violaciones.push(error.message);
  });
  return violaciones;
}

test.describe('cabeceras de seguridad del panel', () => {
  test('cada página trae CSP con un nonce nuevo, HSTS y Permissions-Policy', async ({ request }) => {
    const primera = await request.get('/login');
    const segunda = await request.get('/login');
    const csp = primera.headers()['content-security-policy']!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    const nonce = (valor: string) => /'nonce-([^']+)'/.exec(valor)![1];
    expect(nonce(segunda.headers()['content-security-policy']!)).not.toBe(nonce(csp));

    const cabeceras = primera.headers();
    expect(cabeceras['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(cabeceras['permissions-policy']).toContain('camera=()');
    expect(cabeceras['permissions-policy']).toContain('microphone=()');
    expect(cabeceras['permissions-policy']).toContain('geolocation=()');
    // Las que ya estaban siguen.
    expect(cabeceras['x-frame-options']).toBe('DENY');
    expect(cabeceras['x-content-type-options']).toBe('nosniff');
    expect(cabeceras['referrer-policy']).toBe('same-origin');
  });

  test('cada <script> del HTML que arma el servidor lleva el nonce de la cabecera', async ({ request }) => {
    // Los que Next carga después no lo necesitan: los permite 'strict-dynamic' porque los cargó
    // un script con nonce. Un script inyectado en el HTML no tendría el nonce y no correría.
    const respuesta = await request.get('/login');
    const nonce = /'nonce-([^']+)'/.exec(respuesta.headers()['content-security-policy']!)![1];
    const etiquetas = (await respuesta.text()).match(/<script\b[^>]*>/gi) ?? [];
    expect(etiquetas.length).toBeGreaterThan(0);
    for (const etiqueta of etiquetas) expect(etiqueta).toContain(`nonce="${nonce}"`);
  });

  test('el dueño navega sin violaciones de CSP', async ({ page }) => {
    const violaciones = vigilarCsp(page);
    await entrarYEsperar(page, datos().dueno);
    for (const ruta of ['/agenda', '/mensajes', '/clientes', '/negocio', '/cuenta']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
    }
    // Un clic de verdad: la navegación del cliente también carga scripts.
    await page.goto('/hoy');
    await page.getByRole('link', { name: 'Agenda' }).first().click();
    await expect(page).toHaveURL(/\/agenda/);
    expect(violaciones).toEqual([]);
  });

  test('el superadmin navega sin violaciones de CSP', async ({ page }) => {
    const violaciones = vigilarCsp(page);
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    for (const ruta of ['/superadmin', '/superadmin/uso', '/cuenta']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
    }
    expect(violaciones).toEqual([]);
  });
});
