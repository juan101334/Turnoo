import 'server-only';
import { citaSiExiste } from './datos';
import { horaLocal } from './fechas';
import { exigirUsuario } from './sesion';

/** Con el detalle abierto al lado (?cita=), la pestaña dice qué cita es: '10:00 a. m. · Juan Pérez'. */
export async function tituloConCita(titulo: string, citaId: string | undefined): Promise<string> {
  if (!citaId) return titulo;
  const [usuario, cita] = await Promise.all([exigirUsuario(), citaSiExiste(citaId)]);
  return cita ? `${horaLocal(cita.inicio, usuario.negocio.zonaHoraria)} · ${cita.clienteNombre ?? 'Cita'}` : titulo;
}
