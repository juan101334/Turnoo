import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { UsuarioDelNegocio as UsuarioDeNegocio } from './administracion';
import type { ConsumoDeNegocio, DetalleDeConsumo, ResumenDeConsumo } from './consumo';
import { esId, leer } from './datos';
import type { EstadoNegocio } from './plan';

/**
 * Lo que el superadmin ve de la plataforma, con las rutas que ya tiene el backend
 * (GET /negocios, /negocios/:id, /negocios/:id/whatsapp, /auth/usuarios?negocioId= y /consumo).
 * Sin pagos: el cobro todavía no está diseñado.
 */

export interface NegocioDeLaPlataforma {
  id: string;
  nombre: string;
  telefonoAvisos: string | null;
  zonaHoraria: string;
  estado: EstadoNegocio;
  planId: string | null;
  pruebaHasta: string | null;
  pagadoHasta: string | null;
  createdAt: string;
  /** Solo en la lista: si tiene al menos un número de WhatsApp activo. */
  whatsappConectado?: boolean;
}

/** El token nunca viene: el backend lo guarda cifrado y no lo devuelve. */
export interface CuentaWhatsapp {
  id: string;
  phoneNumberId: string;
  wabaId: string;
  numeroVisible: string;
  activa: boolean;
  createdAt: string;
}

export async function negocios(): Promise<NegocioDeLaPlataforma[]> {
  return (await leer<{ negocios: NegocioDeLaPlataforma[] }>('/negocios')).negocios;
}

export const negocio = cache(async (id: string): Promise<NegocioDeLaPlataforma> => {
  if (!esId(id)) notFound();
  return leer<NegocioDeLaPlataforma>(`/negocios/${id}`);
});

export async function cuentasWhatsapp(negocioId: string): Promise<CuentaWhatsapp[]> {
  if (!esId(negocioId)) notFound();
  return (await leer<{ cuentas: CuentaWhatsapp[] }>(`/negocios/${negocioId}/whatsapp`)).cuentas;
}

export async function usuariosDe(negocioId: string): Promise<UsuarioDeNegocio[]> {
  if (!esId(negocioId)) notFound();
  return (await leer<{ usuarios: UsuarioDeNegocio[] }>(`/auth/usuarios?${new URLSearchParams({ negocioId })}`)).usuarios;
}

/** Uso de toda la plataforma en un mes ('AAAA-MM'), con las alertas de hoy. */
export async function resumenDeConsumo(mes: string): Promise<ResumenDeConsumo> {
  return leer<ResumenDeConsumo>(`/consumo?${new URLSearchParams({ mes })}`);
}

export async function consumoPorNegocio(mes: string): Promise<ConsumoDeNegocio[]> {
  return (await leer<{ negocios: ConsumoDeNegocio[] }>(`/consumo/negocios?${new URLSearchParams({ mes })}`)).negocios;
}

export async function consumoDeNegocio(negocioId: string, mes: string): Promise<DetalleDeConsumo> {
  if (!esId(negocioId)) notFound();
  return leer<DetalleDeConsumo>(`/consumo/negocios/${negocioId}?${new URLSearchParams({ mes })}`);
}
