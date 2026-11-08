/**
 * Entorno del backend para las pruebas de punta a punta del panel (panel/e2e). Igual que
 * vitest.config.ts: siempre la base "turnoo_test", nunca la de desarrollo, sin OpenAI y con una
 * clave de cifrado fija y pública. Debe importarse ANTES que cualquier módulo de src/.
 *
 * SALTOS_PROXY=1: el panel es el proxy que tiene delante, como Caddy en producción.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usa lo que ya exista en el entorno.
}

const base = process.env.DATABASE_URL;
if (!base) throw new Error('Falta DATABASE_URL en backend/.env (se usa para ubicar la base de pruebas).');
const url = new URL(base);
url.pathname = '/turnoo_test';

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'silent',
  DATABASE_URL: url.toString(),
  CLAVE_CIFRADO_TOKENS: Buffer.alloc(32, 1).toString('base64'),
  OPENAI_API_KEY: '',
  ARCHIVOS_DIR: join(tmpdir(), 'turnoo-e2e-archivos'),
  PORT: process.env.E2E_PUERTO_BACKEND ?? '3100',
  PANEL_URL: process.env.E2E_PANEL_URL ?? 'http://localhost:3101',
  SALTOS_PROXY: '1',
  WHATSAPP_APP_SECRET: '',
  WHATSAPP_VERIFY_TOKEN: '',
});
