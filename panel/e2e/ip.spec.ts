import { expect, test, type Browser } from '@playwright/test';
import { alerta, datos, entrar } from './datos';

/**
 * El panel está entre el usuario y el backend. Si no reenviara la IP real, el backend vería
 * siempre la del panel y todos los usuarios compartirían un mismo límite de intentos de login.
 *
 * Aquí la prueba hace de Caddy: cada "usuario" llega con su X-Forwarded-For. El backend corre
 * con SALTOS_PROXY=1 y el panel también. El límite por cuenta e IP es de 5 intentos fallidos.
 */

const IP_ATACANTE = '203.0.113.10';
const IP_DUENO_DE_LA_CUENTA = '198.51.100.20';
const DEMASIADOS = 'Demasiados intentos';

async function paginaDesde(browser: Browser, xForwardedFor: string) {
  const contexto = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': xForwardedFor } });
  return { contexto, page: await contexto.newPage() };
}

test.describe.serial('IP real del usuario hacia el backend', () => {
  test('cada usuario cuenta con su propia IP: frenar a uno no frena a otro', async ({ browser }) => {
    const atacante = await paginaDesde(browser, IP_ATACANTE);
    for (let intento = 1; intento <= 5; intento++) {
      await entrar(atacante.page, datos().limite, `clave-equivocada-${intento}`);
      await expect(alerta(atacante.page)).toHaveText('El correo o la contraseña no son correctos.');
    }
    await entrar(atacante.page, datos().limite, 'clave-equivocada-6');
    await expect(alerta(atacante.page)).toContainText(DEMASIADOS);

    // Desde otra IP, el dueño de la cuenta entra sin problema. Si el panel no reenviara la IP,
    // los dos serían "la IP del panel" y este login también estaría frenado.
    const dueno = await paginaDesde(browser, IP_DUENO_DE_LA_CUENTA);
    await entrar(dueno.page, datos().limite);
    await expect(dueno.page).toHaveURL('/hoy');

    await atacante.contexto.close();
    await dueno.contexto.close();
  });

  test('una X-Forwarded-For escrita por el navegador se ignora: no sirve para saltarse el límite', async ({ browser }) => {
    // El atacante escribe la IP del dueño de la cuenta; Caddy agrega al final su IP real.
    const falsa = await paginaDesde(browser, `${IP_DUENO_DE_LA_CUENTA}, ${IP_ATACANTE}`);
    await entrar(falsa.page, datos().limite);
    await expect(alerta(falsa.page)).toContainText(DEMASIADOS);
    await expect(falsa.page).toHaveURL('/login');
    await falsa.contexto.close();
  });
});
