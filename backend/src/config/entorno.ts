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
  // Webhook de WhatsApp. Vacíos, el webhook rechaza todo: así la API arranca sin cuenta de Meta.
  WHATSAPP_APP_SECRET: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  // Clave con la que se cifran los tokens de Meta guardados en la base: 32 bytes en base64.
  // Vacía, la API arranca, pero no puede registrar cuentas de WhatsApp ni enviar mensajes.
  CLAVE_CIFRADO_TOKENS: z
    .string()
    .default('')
    .refine(
      (valor) => valor === '' || (/^[A-Za-z0-9+/]+={0,2}$/.test(valor) && Buffer.from(valor, 'base64').length === 32),
      'debe ser de 32 bytes en base64 (genérala con: openssl rand -base64 32)',
    ),
  // IA (OpenAI). Sin clave, la API arranca pero no responde por WhatsApp: el procesador no se inicia.
  OPENAI_API_KEY: z.string().default(''),
  // El modelo se cambia aquí, sin tocar código: si uno barato falla las conversaciones de prueba, se sube.
  OPENAI_MODELO: z.string().min(1).default('gpt-6-luna'),
  // Modelo que pasa las notas de voz a texto.
  OPENAI_MODELO_AUDIO: z.string().min(1).default('gpt-transcribe'),
  // Carpeta donde se guardan las imágenes de los clientes. Datos personales: va en los backups y nunca en git.
  ARCHIVOS_DIR: z.string().min(1).default('archivos'),
  // Cuánto razona el modelo antes de responder. Más esfuerzo, más tokens de salida y más demora.
  OPENAI_ESFUERZO: z.enum(['none', 'low', 'medium', 'high']).default('low'),
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
