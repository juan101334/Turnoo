import { expect, request, test } from '@playwright/test';
import { alerta, BACKEND, COOKIE, datos, entrar, entrarYEsperar } from './datos';

test.describe('acceso', () => {
  test('sin sesión, una página del panel lleva al login', async ({ page }) => {
    await page.goto('/hoy');
    await expect(page).toHaveURL('/login');
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('el dueño entra: cookie HttpOnly y SameSite=Lax, sin token en la URL ni en el almacenamiento', async ({ page, context }) => {
    await entrarYEsperar(page, datos().dueno);
    await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible();
    await expect(page.getByText('Barbería E2E')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    expect(cookie!.path).toBe('/');

    const visibleParaElNavegador = await page.evaluate(() => ({
      cookies: document.cookie,
      local: JSON.stringify(localStorage),
      sesion: JSON.stringify(sessionStorage),
      url: location.href,
    }));
    for (const valor of Object.values(visibleParaElNavegador)) expect(valor).not.toContain(cookie!.value);
  });

  test('la navegación del dueño muestra sus pestañas', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    for (const pestana of ['Hoy', 'Agenda', 'Por aprobar', 'Mensajes', 'Más']) {
      await expect(nav.getByRole('link', { name: pestana })).toBeVisible();
    }
    await nav.getByRole('link', { name: 'Más' }).click();
    await expect(page.getByRole('link', { name: 'Usuarios' })).toBeVisible();
    await page.goto('/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  });

  test('el barbero no ve las secciones del dueño, y escribirlas a mano da "no existe"', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    for (const pestana of ['Hoy', 'Agenda', 'Bloqueos', 'Clientes', 'Cuenta']) {
      await expect(nav.getByRole('link', { name: pestana })).toBeVisible();
    }
    for (const ajena of ['Por aprobar', 'Mensajes', 'Más']) await expect(nav.getByRole('link', { name: ajena })).toHaveCount(0);

    for (const ruta of ['/usuarios', '/por-aprobar', '/mensajes', '/plan', '/mas']) {
      // Con las pantallas de carga la respuesta sale por partes y ya no lleva el código 404; lo
      // que importa es que no se muestra nada de la sección.
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'Esta página no existe' }), ruta).toBeVisible();
    }
  });

  test('una contraseña incorrecta muestra el error y no deja cookie', async ({ page, context }) => {
    await entrar(page, datos().empleado, 'no-es-la-clave-123');
    await expect(alerta(page)).toHaveText('El correo o la contraseña no son correctos.');
    await expect(page.getByLabel('Correo')).toHaveValue(datos().empleado);
    expect((await context.cookies()).some((c) => c.name === COOKIE)).toBe(false);
  });

  test('cerrar sesión borra la cookie y revoca la sesión en el backend', async ({ page, context }) => {
    await entrarYEsperar(page, datos().empleado);
    const token = (await context.cookies()).find((c) => c.name === COOKIE)!.value;

    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Cuenta' }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL('/login');
    expect((await context.cookies()).some((c) => c.name === COOKIE)).toBe(false);

    const backend = await request.newContext({ baseURL: BACKEND });
    const yo = await backend.get('/auth/yo', { headers: { Authorization: `Bearer ${token}` } });
    expect(yo.status()).toBe(401);
    await backend.dispose();
  });

  test('una cookie que el backend ya no acepta se borra y lleva al login', async ({ page, context }) => {
    await context.addCookies([{ name: COOKIE, value: 'token-que-no-existe', url: 'http://localhost:3101' }]);
    await page.goto('/hoy');
    await expect(page).toHaveURL('/login?vencida=1');
    await expect(page.getByText('Tu sesión terminó. Vuelve a entrar.')).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === COOKIE)).toBe(false);
  });

  test('el superadmin entra a su panel y no al de un negocio; el dueño no entra al del superadmin', async ({ page }) => {
    await entrarYEsperar(page, datos().superadmin, '/superadmin');
    await expect(page.getByRole('heading', { level: 1, name: 'Negocios' })).toBeVisible();
    await page.goto('/hoy');
    await expect(page).toHaveURL('/superadmin');

    await page.context().clearCookies();
    await entrarYEsperar(page, datos().dueno);
    await page.goto('/superadmin');
    await expect(page).toHaveURL('/hoy');
  });
});

test.describe('enlaces de un solo uso', () => {
  test('aceptar la invitación: el token sale de la URL, se crea la contraseña y se puede entrar', async ({ page }) => {
    const { email, token } = datos().invitacion;
    await page.goto(`/aceptar-invitacion#token=${encodeURIComponent(token)}`);
    await expect(page.getByLabel('Contraseña nueva')).toBeVisible();
    expect(page.url()).not.toContain(token);
    expect(page.url()).toBe('http://localhost:3101/aceptar-invitacion');

    await page.getByLabel('Contraseña nueva').fill('corta');
    await page.getByLabel('Repite la contraseña').fill('corta');
    await page.getByRole('button', { name: 'Crear contraseña' }).click();
    await expect(alerta(page)).toContainText('entre 10 y 128 caracteres');

    const nueva = 'mi-clave-nueva-123';
    await page.getByLabel('Contraseña nueva').fill(nueva);
    await page.getByLabel('Repite la contraseña').fill(nueva);
    await page.getByRole('button', { name: 'Crear contraseña' }).click();
    await expect(page).toHaveURL('/login?listo=invitacion');
    await expect(page.getByText('Tu contraseña quedó guardada. Ya puedes entrar.')).toBeVisible();

    await entrar(page, email, nueva);
    await expect(page).toHaveURL('/hoy');
  });

  test('un enlace sin token avisa que no es válido', async ({ page }) => {
    await page.goto('/aceptar-invitacion');
    await expect(alerta(page)).toContainText('El enlace no es válido');
  });

  test('restablecer la contraseña con el enlace del dueño; el mismo enlace no sirve dos veces', async ({ page }) => {
    const { email, token } = datos().recuperacion;
    const nueva = 'otra-clave-nueva-456';
    await page.goto(`/restablecer-contrasena#token=${encodeURIComponent(token)}`);
    await expect(page.getByLabel('Contraseña nueva')).toBeVisible();
    expect(page.url()).not.toContain(token);

    await page.getByLabel('Contraseña nueva').fill(nueva);
    await page.getByLabel('Repite la contraseña').fill('no-coincide-789');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(alerta(page)).toHaveText('Las dos contraseñas no coinciden.');

    // Tras un error lo escrito se conserva: solo se corrige la que no coincidía.
    await expect(page.getByLabel('Contraseña nueva')).toHaveValue(nueva);
    await page.getByLabel('Repite la contraseña').fill(nueva);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL('/login?listo=contrasena');
    await entrar(page, email, nueva);
    await expect(page).toHaveURL('/hoy');

    await page.context().clearCookies();
    await page.goto(`/restablecer-contrasena#token=${encodeURIComponent(token)}`);
    await page.getByLabel('Contraseña nueva').fill('tercera-clave-789');
    await page.getByLabel('Repite la contraseña').fill('tercera-clave-789');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(alerta(page)).toContainText('ya se usó o venció');
  });
});
