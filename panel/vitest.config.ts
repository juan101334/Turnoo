import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // 'server-only' lanza fuera del servidor de Next; en las pruebas no hace falta.
      'server-only': fileURLToPath(new URL('./pruebas/vacio.ts', import.meta.url)),
    },
  },
  test: { include: ['pruebas/**/*.test.ts'] },
});
