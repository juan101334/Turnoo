import { expect, test, type Page } from '@playwright/test';
import { datos, entrarYEsperar } from './datos';

/**
 * La agenda del día: en el celular, lista con "Sigue", huecos y "Completada" en la tarjeta (con
 * deshacer); en el escritorio, grilla por barbero con el detalle al lado. Ver sembrar.ts:
 * "Cliente Deshacer" y "Cliente Rápido" ya empezaron (Barbero E2E); `vista.fecha` tiene a las 9:00
 * una cita por barbero y el almuerzo del Barbero E2E de 13:00 a 14:00.
 */

const esCelular = (nombre: string) => nombre === 'celular';
const tarjeta = (page: Page, cliente: string) => page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(cliente) }) });

test.describe('agenda en el celular', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Lista del celular'));

  test('"Completada" en la tarjeta: Deshacer la deja como estaba y no se guarda', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().empleado);
    // install() deja correr el tiempo: se pausa para que los 7 s de deshacer no se acaben solos.
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const cita = tarjeta(page, 'Cliente Deshacer');
    await cita.getByRole('button', { name: 'Completada, Cliente Deshacer' }).click();
    await expect(cita.getByText('Completada', { exact: true })).toBeVisible();
    await expect(cita.getByRole('button')).toHaveCount(0);

    const aviso = page.getByRole('status').filter({ hasText: 'Completada: Cliente Deshacer.' });
    await aviso.getByRole('button', { name: 'Deshacer' }).click();
    await expect(cita.getByRole('button', { name: 'Completada, Cliente Deshacer' })).toBeVisible();

    // Al recargar sigue sin marcar: nunca se mandó al backend.
    // Con el reloj quieto la página no termina de cargar: se reanuda antes de recargar.
    await page.clock.resume();
    await page.reload();
    await expect(tarjeta(page, 'Cliente Deshacer').getByText('Pendiente', { exact: true })).toBeVisible();
  });

  test('"Completada" en la tarjeta se guarda cuando se acaba el tiempo para deshacer', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().empleado);
    await page.waitForLoadState('networkidle');
    await tarjeta(page, 'Cliente Rápido').getByRole('button', { name: 'Completada, Cliente Rápido' }).click();

    const guardado = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/hoy'));
    await page.clock.fastForward('00:08');
    expect((await guardado).ok()).toBe(true);

    await page.reload();
    const cita = tarjeta(page, 'Cliente Rápido');
    await expect(cita.getByText('Completada', { exact: true })).toBeVisible();
    await expect(cita.getByRole('button')).toHaveCount(0);
  });

  test('Hoy muestra arriba quién sigue, con el barbero para el dueño', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const sigue = page.getByRole('region', { name: /^(Sigue|En curso)/ });
    await expect(sigue).toBeVisible();
    await expect(sigue).toContainText('Barbero Dos');
    await expect(sigue.getByRole('link', { name: 'Ver cita' })).toHaveAttribute('href', /^\/citas\/[0-9a-f-]{36}$/);
  });

  test('el día muestra fin, duración y precio, los bloqueos y los huecos para agendar', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${fecha}`);

    await expect(tarjeta(page, 'Cliente Vista Uno')).toContainText(/hasta 9:30.*· 30 min · \$25\.000/);
    await expect(tarjeta(page, 'Cliente Vista Uno')).toContainText('Confirmada');
    await expect(page.getByRole('listitem').filter({ hasText: 'Almuerzo' })).toContainText(/1:00.*– 2:00/);

    const hueco = page.getByRole('link', { name: /^Agendar, libre de 8:00/ });
    await expect(hueco).toHaveAttribute('href', new RegExp(`^/citas/nueva\\?fecha=${fecha}&barbero=[0-9a-f-]{36}&hora=`));
    // De 9:30 a 13:00 libre; el almuerzo parte la tarde.
    await expect(page.getByRole('link', { name: /^Agendar, libre de 9:30.*– 1:00/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Agendar, libre de 2:00/ })).toBeVisible();
  });

  test('el calendario junto a la tira cambia de día al elegir, sin otro botón', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/agenda');
    // El calendario cambia de día con JavaScript: que la página ya esté interactiva.
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Ir a otra fecha').fill(fecha);
    await expect(page).toHaveURL(`/agenda?fecha=${fecha}`);
    await expect(tarjeta(page, 'Cliente Vista Uno')).toBeVisible();
  });
});

test.describe('agenda en el celular: filas y botón flotante', () => {
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Lista del celular'));

  test('la tira abre con el día elegido a la vista y la fila de barberos se desvanece donde sigue', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    await page.waitForLoadState('networkidle');
    const elegido = page.getByRole('navigation', { name: 'Días' }).locator('[aria-current="date"]');
    await expect(elegido).toBeInViewport({ ratio: 1 });

    const fila = page.getByRole('navigation', { name: 'Barbero' }).locator('div').first();
    const mascara = () => fila.evaluate((f) => getComputedStyle(f).maskImage || getComputedStyle(f).webkitMaskImage);
    // Al principio, solo a la derecha; al final, solo a la izquierda.
    await expect.poll(mascara).toMatch(/^linear-gradient\(to right, rgb\(0, 0, 0\), rgb\(0, 0, 0\), rgb\(0, 0, 0\) calc\(100% - 32px\), rgba\(0, 0, 0, 0\)\)$/);
    await fila.evaluate((f) => f.scrollTo({ left: f.scrollWidth }));
    await expect.poll(mascara).toMatch(/^linear-gradient\(to right, rgba\(0, 0, 0, 0\), rgb\(0, 0, 0\) 32px, rgb\(0, 0, 0\), rgb\(0, 0, 0\)\)$/);
  });

  test('"Nueva cita" flotante no tapa la última tarjeta al llegar abajo', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const ultima = (await page.getByRole('main').getByRole('listitem').last().boundingBox())!;
    const boton = (await page.getByRole('link', { name: 'Nueva cita' }).boundingBox())!;
    expect(ultima.y + ultima.height).toBeLessThanOrEqual(boton.y);
  });
});

test.describe('marcar pasadas como completadas', () => {
  // Marca de verdad las dos citas del Barbero Lote: corre en un solo proyecto.
  test.beforeEach(({}, info) => test.skip(!esCelular(info.project.name), 'Marca citas de verdad: una sola vez'));

  test('en Hoy confirma con la lista de citas y las marca todas', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/hoy?barbero=${datos().lote.barbero}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Marcar las 2 como completadas' }).click();

    const dialogo = page.getByRole('alertdialog', { name: '¿Marcar 2 citas como completadas?' });
    const lista = dialogo.getByRole('list', { name: 'Citas que se marcan' });
    await expect(lista.getByRole('listitem')).toHaveCount(2);
    await expect(lista).toContainText('Cliente Lote Uno');
    await expect(lista).toContainText('Cliente Lote Dos');
    await dialogo.getByRole('button', { name: 'Marcar como completadas' }).click();

    await expect(page.getByRole('status').filter({ hasText: '2 citas marcadas como completadas.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Marcar las \d+ como completadas$/ })).toHaveCount(0);
    for (const cliente of ['Cliente Lote Uno', 'Cliente Lote Dos']) {
      await expect(tarjeta(page, cliente).getByText('Completada', { exact: true })).toBeVisible();
    }
  });

  test('solo en Hoy: la Agenda del mismo día no lo ofrece', async ({ page }) => {
    // El barbero tiene hoy citas que ya terminaron ("Cliente Deshacer", "Cliente Rápido").
    await entrarYEsperar(page, datos().empleado);
    await expect(page.getByRole('button', { name: /^Marcar las \d+ como completadas$/ })).toBeVisible();
    await page.goto('/agenda');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /como completadas$/ })).toHaveCount(0);
  });
});

test.describe('agenda en el escritorio', () => {
  test.beforeEach(({}, info) => test.skip(esCelular(info.project.name), 'Grilla del escritorio'));

  test('una columna por barbero, con citas y bloqueos en su hora', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    const uno = page.getByRole('group', { name: 'Agenda de Barbero E2E' });
    const dos = page.getByRole('group', { name: 'Agenda de Barbero Dos' });
    await expect(uno.getByRole('link', { name: /Cliente Vista Uno, Confirmada, Corte/ })).toBeVisible();
    await expect(dos.getByRole('link', { name: /Cliente Vista Dos, Pendiente, Corte/ })).toBeVisible();
    await expect(uno.getByText('Almuerzo')).toBeVisible();
    await expect(dos.getByText('Almuerzo')).toHaveCount(0);
    // Las dos citas de las 9:00 quedan a la misma altura.
    const [a, b] = await Promise.all([
      uno.getByRole('link', { name: /Cliente Vista Uno/ }).boundingBox(),
      dos.getByRole('link', { name: /Cliente Vista Dos/ }).boundingBox(),
    ]);
    expect(a!.y).toBe(b!.y);
  });

  test('la cita se abre al lado sin salir de la agenda, y Escape la cierra', async ({ page }) => {
    const { fecha } = datos().vista;
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${fecha}`);
    await page.getByRole('link', { name: /Cliente Vista Uno/ }).click();

    await expect(page).toHaveURL(new RegExp(`/agenda\\?fecha=${fecha}&cita=[0-9a-f-]{36}$`));
    await expect(page).toHaveTitle(/Cliente Vista Uno · Turnoo/);
    const panel = page.getByRole('complementary', { name: /9:00/ });
    await expect(panel).toContainText('Barbero E2E');
    await expect(panel.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.getByRole('group', { name: 'Agenda de Barbero Dos' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`/agenda?fecha=${fecha}`);
    await expect(panel).toHaveCount(0);
  });

  for (const hora of ['10:30', '11:45']) {
    test(`clic en las ${hora} de un hueco: la franja dice "+ ${hora}" y Nueva cita la deja marcada`, async ({ page }) => {
      const { fecha } = datos().vista;
      await entrarYEsperar(page, datos().dueno);
      await page.goto(`/agenda?fecha=${fecha}`);
      // La franja sigue al mouse con JavaScript: que la página ya esté interactiva.
      await page.waitForLoadState('networkidle');
      // El hueco del Barbero E2E va de 9:30 (fin de su cita) a 13:00 (almuerzo); 15 min = 20 px.
      const hueco = page.getByRole('group', { name: 'Agenda de Barbero E2E' }).getByRole('link', { name: /^Agendar con Barbero E2E, libre de 9:30/ });
      const caja = (await hueco.boundingBox())!;
      const [h, m] = hora.split(':').map(Number) as [number, number];
      // 5 px dentro de la franja (menos de 4 minutos): cae en la franja de esa hora, no en la siguiente.
      const y = caja.y + (h * 60 + m - (9 * 60 + 30)) * (20 / 15) + 5;
      await page.mouse.move(caja.x + 30, y);
      await expect(hueco.locator('[data-hora]')).toHaveText(new RegExp(`^\\+ ${hora}`));

      await page.mouse.click(caja.x + 30, y);
      await expect(page).toHaveURL((url) => url.pathname === '/citas/nueva' && (url.searchParams.get('hora') ?? '').startsWith(`${fecha}T${hora.padStart(5, '0')}:00`));
      await page.getByRole('link', { name: 'Cliente nuevo', exact: true }).click();
      await page.getByRole('checkbox', { name: /Corte/ }).check();
      await page.getByRole('button', { name: 'Ver horas libres' }).click();
      await expect(page.getByRole('radio', { name: new RegExp(`^${hora}`) })).toBeChecked();
    });
  }

  test('cada cita de la grilla dice su estado con ícono y texto, no solo con el color', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    const uno = page.locator('#grilla-del-dia a[title*="Cliente Vista Uno"]');
    const dos = page.locator('#grilla-del-dia a[title*="Cliente Vista Dos"]');
    await expect(uno).toContainText('Confirmada');
    await expect(dos).toContainText('Pendiente');
    await expect(uno.locator('svg')).toHaveCount(1);
    await expect(dos.locator('svg')).toHaveCount(1);
  });

  test('"Completada" en la grilla para una cita que ya empezó; Deshacer la deja como estaba', async ({ page }) => {
    await page.clock.install();
    await entrarYEsperar(page, datos().empleado);
    await page.waitForLoadState('networkidle');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const bloque = page.locator('#grilla-del-dia a[title*="Cliente Deshacer"]');
    await expect(bloque).toContainText('Pendiente');
    await page.locator('#grilla-del-dia').getByRole('button', { name: 'Completada, Cliente Deshacer' }).click();
    await expect(bloque).toContainText('Completada');
    await expect(page.locator('#grilla-del-dia').getByRole('button', { name: 'Completada, Cliente Deshacer' })).toHaveCount(0);

    await page.getByRole('status').filter({ hasText: 'Completada: Cliente Deshacer.' }).getByRole('button', { name: 'Deshacer' }).click();
    await expect(bloque).toContainText('Pendiente');
    await expect(page.locator('#grilla-del-dia').getByRole('button', { name: 'Completada, Cliente Deshacer' })).toBeVisible();
  });

  test('una cita que no es del barbero no rompe la agenda: el panel lo dice', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}&cita=${datos().agenda.citaAjena}`);
    await expect(page.getByText('Esta cita no existe o no es de tu agenda.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Agenda de Barbero E2E' })).toBeVisible();
  });

  test('sin flechas: la tira pasa de semana con sus botones o con la rueda, sin mover la página', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/agenda');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /^Día (anterior|siguiente)$/ })).toHaveCount(0);
    const dias = page.getByRole('navigation', { name: 'Días' });
    const fila = dias.locator('div').first();
    const anterior = dias.getByRole('button', { name: 'Semana anterior' });
    const siguiente = dias.getByRole('button', { name: 'Semana siguiente' });
    const desplazado = () => fila.evaluate((f) => f.scrollLeft);
    await expect(anterior).toBeDisabled();

    // Seis semanas: el día 41 no se ve hasta pasar de semana.
    const ultimo = dias.getByRole('link').nth(41);
    await expect(ultimo).not.toBeInViewport();
    await siguiente.click();
    await expect(anterior).toBeEnabled();
    await expect.poll(desplazado).toBeGreaterThan(0);
    // Avanza de a 7 días (64 px cada uno), no lo que se ve.
    await expect.poll(desplazado).toBe(7 * 64);
    for (let i = 0; i < 6; i++) await siguiente.click();
    await expect(ultimo).toBeInViewport();
    await expect(siguiente).toBeDisabled();
    await anterior.click();
    await expect(siguiente).toBeEnabled();

    // La rueda sobre la tira la mueve de lado y no baja la página.
    await fila.evaluate((f) => (f.scrollLeft = 0));
    await fila.hover();
    await page.mouse.wheel(0, 200);
    await expect.poll(desplazado).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('un día más allá de la tira la hace empezar en él, marcado', async ({ page }) => {
    await entrarYEsperar(page, datos().empleado);
    await page.goto('/agenda?fecha=2099-01-15');
    const elegido = page.getByRole('navigation', { name: 'Días' }).getByRole('link', { name: /15/ }).first();
    await expect(elegido).toHaveAttribute('aria-current', 'date');
    await expect(elegido).toBeInViewport();
  });

  test('Hoy en el PC: "Sigue" abre la cita al lado, y el resumen cuenta el día', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const sigue = page.getByRole('region', { name: /^(Sigue|En curso)/ });
    await expect(sigue).toBeVisible();
    await expect(sigue.getByRole('link', { name: 'Ver cita' })).toHaveAttribute('href', /^\/hoy\?cita=[0-9a-f-]{36}$/);
    const resumen = page.getByRole('region', { name: 'Resumen del día' });
    await expect(resumen).toContainText(/Citas\s*\d+/);
    await expect(resumen).not.toContainText('$');

    // Un día que no es hoy: solo el resumen, sin "Sigue".
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    await expect(page.getByRole('region', { name: /^(Sigue|En curso)/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Resumen del día' })).toContainText(/Citas\s*2.*Completadas\s*0.*Por aprobar\s*0/);
  });

  test('los barberos que no trabajan ese día se esconden hasta "Mostrar todos"', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    await page.goto(`/agenda?fecha=${datos().vista.fecha}`);
    const limite = page.getByRole('group', { name: 'Agenda de Barbero Límite' });
    const dos = page.getByRole('group', { name: 'Agenda de Barbero Dos' });
    await expect(page.getByText(/^No trabajan este día: .*Barbero Límite/)).toBeVisible();
    await expect(limite).toBeHidden();
    // Las columnas que quedan se reparten el ancho: la escondida no deja un hueco.
    const grilla = (await page.locator('#grilla-del-dia').boundingBox())!;
    const ancho = (await dos.boundingBox())!.width;
    const visibles = await page.getByRole('group', { name: /^Agenda de / }).evaluateAll((g) => g.filter((x) => (x as HTMLElement).offsetParent !== null).length);
    expect(ancho).toBeGreaterThan((grilla.width - 80) / visibles - 4);

    const boton = page.getByRole('button', { name: 'Mostrar todos' });
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await boton.click();
    await expect(limite).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ocultar a los que no trabajan' })).toHaveAttribute('aria-expanded', 'true');
    expect((await dos.boundingBox())!.width).toBeLessThan(ancho);
    await page.getByRole('button', { name: 'Ocultar a los que no trabajan' }).click();
    await expect(limite).toBeHidden();

    // Al día siguiente el Barbero Olvidadizo tiene una cita sin tener horario: se ve, no se esconde.
    await page.goto(`/agenda?fecha=${diaSiguiente(datos().vista.fecha)}`);
    await expect(page.getByRole('group', { name: 'Agenda de Barbero Olvidadizo' }).getByRole('link', { name: /Cliente Sin Horario/ })).toBeVisible();
    await expect(page.getByText(/^No trabajan este día: /)).not.toContainText('Olvidadizo');

    // Filtrado a ese barbero, su columna se ve aunque no trabaje.
    await page.goto(`/agenda?fecha=${datos().vista.fecha}&barbero=${await idDe(page, 'Barbero Límite')}`);
    await expect(limite).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mostrar todos' })).toHaveCount(0);
  });

  test('en la grilla los nombres no se cortan, ni con todas las columnas', async ({ page }) => {
    // A 1024 px y con todas las columnas, varios nombres no caben en una línea y pasan a la siguiente.
    await page.setViewportSize({ width: 1024, height: 900 });
    await entrarYEsperar(page, datos().dueno);
    await page.getByRole('button', { name: 'Mostrar todos' }).click();
    // Cada bloque deja ver la hora y el nombre completos (dentro de lo que se ve del texto, que
    // corta por líneas enteras): lo que no cabe son los servicios.
    const nombres = await page.locator('#grilla-del-dia a[title]').evaluateAll((enlaces) =>
      enlaces.map((a) => {
        const nombre = a.querySelector('span > span.font-medium') as HTMLElement;
        const visible = nombre.parentElement!.getBoundingClientRect();
        const lineas = [...nombre.getClientRects()];
        return { nombre: nombre.textContent, enDosLineas: new Set(lineas.map((r) => Math.round(r.top))).size > 1, dentro: lineas.every((r) => r.bottom <= visible.bottom + 0.5) };
      }),
    );
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.some((n) => n.enDosLineas)).toBe(true);
    expect(nombres.filter((n) => !n.dentro)).toEqual([]);
    // Los nombres de los barberos tampoco llevan "…".
    await expect(page.locator('#grilla-del-dia .truncate')).toHaveCount(0);
  });

  test('la etiqueta de la hora actual no tapa la de una hora entera', async ({ page }) => {
    await entrarYEsperar(page, datos().dueno);
    const ahora = page.locator('#grilla-ahora');
    await expect(ahora).toBeVisible();
    const caja = (await ahora.boundingBox())!;
    const chocan = await page.locator('#grilla-del-dia [aria-hidden] > span:not(#grilla-ahora)').evaluateAll(
      (etiquetas, c) =>
        etiquetas
          .filter((e) => getComputedStyle(e).visibility !== 'hidden')
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.bottom > c.y && r.top < c.y + c.height).length,
      caja,
    );
    expect(chocan).toBe(0);
  });
});

/** '2026-11-20' → '2026-11-21' (a mediodía UTC: sin líos de zona). */
const diaSiguiente = (fecha: string) => new Date(Date.parse(`${fecha}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Id de un barbero, tomado del filtro. */
async function idDe(page: Page, nombre: string): Promise<string> {
  const href = await page.getByRole('navigation', { name: 'Barbero' }).getByRole('link', { name: nombre }).getAttribute('href');
  return new URL(href!, 'http://x').searchParams.get('barbero')!;
}
