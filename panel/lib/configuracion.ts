import 'server-only';
import { numeroDeSoporte } from './soporte';

/**
 * Variables de entorno del panel (panel/.env.example). Solo el servidor las lee: ninguna empieza
 * por NEXT_PUBLIC_, así que nunca llegan al navegador.
 */

function saltosProxy(): number {
  const valor = Number(process.env.SALTOS_PROXY ?? '0');
  if (!Number.isInteger(valor) || valor < 0 || valor > 5) {
    throw new Error('SALTOS_PROXY debe ser un entero entre 0 y 5 (revisa panel/.env.local)');
  }
  return valor;
}

export const configuracion = {
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
  saltosProxy: saltosProxy(),
  /** En producción la cookie exige HTTPS y lleva el prefijo __Host- (sin dominio, ruta /). */
  produccion: process.env.NODE_ENV === 'production',
  /** Solo dígitos, o null si no está configurado (entonces no se muestra el enlace). */
  soporteWhatsapp: numeroDeSoporte(process.env.SOPORTE_WHATSAPP),
};
