import { defineConfig } from 'vitest/config';

// Las pruebas NUNCA tocan tu base de datos de desarrollo: usan siempre "turnoo_test",
// en el mismo servidor y con el mismo usuario que indica backend/.env.
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usa lo que ya exista en el entorno.
}

const base = process.env.DATABASE_URL;
if (!base) {
  throw new Error('Falta DATABASE_URL en backend/.env (se usa para ubicar la base de pruebas).');
}
const urlPruebas = new URL(base);
urlPruebas.pathname = '/turnoo_test';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.test.ts'],
    setupFiles: ['pruebas/configuracion.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urlPruebas.toString(),
    },
    // Los archivos comparten una sola base de datos: se ejecutan de uno en uno.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
