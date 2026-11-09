import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de punta a punta: el panel de verdad contra el backend de verdad, sobre turnoo_test.
 * Puertos propios (3100 y 3101) para no chocar con los de desarrollo (3000 y 3001).
 *
 * El panel corre con SALTOS_PROXY=1, como detrás de Caddy: las pruebas mandan X-Forwarded-For
 * haciendo de Caddy, y así se comprueba qué IP le llega al backend.
 */
const PANEL = 'http://localhost:3101';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  // Comparten una sola base y los contadores de intentos: de una en una.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: PANEL,
    trace: 'retain-on-failure',
    locale: 'es-CO',
  },
  projects: [
    // Google Chrome del sistema: no hace falta descargar el navegador de Playwright.
    { name: 'celular', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    // Los flujos principales también en un PC del local: menú lateral y marco ancho.
    {
      name: 'escritorio',
      testMatch: /(flujos|agenda)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npx tsx pruebas/e2e/servidor.ts',
      cwd: '../backend',
      url: 'http://localhost:3100/salud',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx next dev --port 3101',
      url: `${PANEL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BACKEND_URL: 'http://localhost:3100', SALTOS_PROXY: '1', PANEL_DIST_DIR: '.next-e2e' },
    },
  ],
});
