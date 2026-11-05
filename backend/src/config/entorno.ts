import { z } from 'zod';

/**
 * Variables de entorno de la aplicación, validadas al arrancar.
 * Si falta alguna o es inválida, el programa se detiene con un mensaje claro.
 * Cuando agregues una variable, agrégala también a backend/.env.example.
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z
    .string()
    .min(1, 'es obligatoria')
    .regex(/^postgres(ql)?:\/\//, 'debe empezar con postgresql://'),
  // Dirección del panel web; con ella se arman los enlaces de invitación y recuperación.
  PANEL_URL: z.url().default('http://localhost:3001'),
  // Cuántos proxies propios hay delante de la API (1 con Caddy). Con 0 se ignora X-Forwarded-For.
  // Un valor mayor al real deja a cualquiera falsificar su IP y evadir el límite de login.
  SALTOS_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('Configuración inválida. Revisa tu archivo backend/.env:');
  for (const problema of resultado.error.issues) {
    console.error(`  - ${problema.path.join('.')}: ${problema.message}`);
  }
  process.exit(1);
}

export const entorno = resultado.data;
