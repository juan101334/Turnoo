/**
 * Crea el PRIMER superadmin: deja el usuario pendiente y muestra el enlace para definir su contraseña.
 *
 * Uso (desde backend/):  npm run superadmin -- correo@dominio.com "Nombre Apellido"
 * Usa la base de DATABASE_URL (backend/.env).
 */
import { entorno } from '../src/config/entorno.js';
import { pool } from '../src/db/pool.js';
import { invitarSuperadmin } from '../src/modulos/auth/auth.servicio.js';

const [email, nombre] = process.argv.slice(2);
if (!email || !nombre) {
  console.error('Uso: npm run superadmin -- correo@dominio.com "Nombre Apellido"');
  process.exit(1);
}

try {
  const { token, expiraEn } = await invitarSuperadmin(email, nombre);
  console.log('Superadmin creado (pendiente de definir contraseña).');
  console.log(`Enlace (vence ${expiraEn.toISOString()}):`);
  console.log(`${entorno.PANEL_URL}/aceptar-invitacion#token=${encodeURIComponent(token)}`);
} catch (error) {
  console.error('No se pudo crear:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
