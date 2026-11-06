import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

/**
 * Conversaciones de prueba contra el modelo REAL de OpenAI: cuestan saldo. Solo corren con
 * `npm run ia:evaluar`, nunca con `npm test`. Usan la base turnoo_test, igual que las pruebas.
 * La clave sale de backend/.env (vitest.config.ts ya lo cargó) y no se imprime.
 *
 * No se usa mergeConfig: juntaría las listas `include` y correría también todas las pruebas.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['evaluacion/**/*.eval.ts'],
    env: { ...base.test?.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '' },
    testTimeout: 180_000,
  },
});
