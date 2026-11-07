/**
 * Enlace para que un superadmin vuelva a entrar si olvidó su contraseña. Solo se corre con
 * acceso al servidor: no hay ruta HTTP que lo haga. Anula los enlaces anteriores de ese superadmin.
 *
 * Uso (desde backend/):  npm run recuperar-superadmin -- correo@dominio.com
 * Usa la base de DATABASE_URL (backend/.env).
 */
import { entorno } from '../src/config/entorno.js';
import { pool } from '../src/db/pool.js';
import { recuperarSuperadmin } from '../src/modulos/auth/auth.servicio.js';

const argumentos = process.argv.slice(2);
if (argumentos.length !== 1) {
  console.error('Uso: npm run recuperar-superadmin -- correo@dominio.com');
  process.exit(1);
}

try {
  const { token, expiraEn, tipo } = await recuperarSuperadmin(argumentos[0]!);
  const ruta = tipo === 'recuperacion' ? '/restablecer-contrasena' : '/aceptar-invitacion';
  console.log(tipo === 'recuperacion' ? 'Enlace para cambiar la contraseña.' : 'Nunca definió su contraseña: invitación nueva.');
  console.log(`Enlace (vence ${expiraEn.toISOString()}; no lo compartas):`);
  console.log(`${entorno.PANEL_URL}${ruta}#token=${encodeURIComponent(token)}`);
} catch (error) {
  console.error('No se pudo generar el enlace:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
