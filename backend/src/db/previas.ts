import { pool } from './pool.js';

/**
 * Las ÚNICAS dos consultas que ocurren antes de saber a qué negocio pertenece
 * la petición (llega un webhook de WhatsApp, o alguien intenta iniciar sesión).
 * Llaman a funciones de PostgreSQL que saltan el RLS y devuelven lo mínimo.
 */

export interface CuentaWhatsapp {
  cuentaId: string;
  negocioId: string;
  profesionalId: string | null;
  tokenAccesoCifrado: string;
  estadoNegocio: 'prueba' | 'activo' | 'suspendido';
}

export async function buscarCuentaWhatsapp(
  phoneNumberId: string,
): Promise<CuentaWhatsapp | null> {
  const { rows } = await pool.query<{
    cuenta_id: string;
    negocio_id: string;
    profesional_id: string | null;
    token_acceso_cifrado: string;
    estado_negocio: CuentaWhatsapp['estadoNegocio'];
  }>('SELECT * FROM fn_buscar_cuenta_whatsapp($1)', [phoneNumberId]);

  const fila = rows[0];
  if (!fila) return null;
  return {
    cuentaId: fila.cuenta_id,
    negocioId: fila.negocio_id,
    profesionalId: fila.profesional_id,
    tokenAccesoCifrado: fila.token_acceso_cifrado,
    estadoNegocio: fila.estado_negocio,
  };
}

export interface UsuarioParaLogin {
  id: string;
  negocioId: string | null;
  rol: 'superadmin' | 'dueno' | 'empleado';
  nombre: string;
  passwordHash: string | null;
  activo: boolean;
}

export async function usuarioParaLogin(email: string): Promise<UsuarioParaLogin | null> {
  const { rows } = await pool.query<{
    id: string;
    negocio_id: string | null;
    rol: UsuarioParaLogin['rol'];
    nombre: string;
    password_hash: string | null;
    activo: boolean;
  }>('SELECT * FROM fn_usuario_para_login($1)', [email]);

  const fila = rows[0];
  if (!fila) return null;
  return {
    id: fila.id,
    negocioId: fila.negocio_id,
    rol: fila.rol,
    nombre: fila.nombre,
    passwordHash: fila.password_hash,
    activo: fila.activo,
  };
}
