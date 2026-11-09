/**
 * Lógica de las pantallas de administración (barberos, servicios, horarios, usuarios y ajustes),
 * sin llamadas al backend para poder probarla sola. El backend vuelve a validar todo.
 */

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** 1 = lunes ... 7 = domingo, como el backend. */
export function nombreDelDia(diaSemana: number): string {
  return DIAS_SEMANA[diaSemana - 1] ?? 'Día';
}

export interface Horario {
  id: string;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

/** Los siete días en orden, cada uno con sus rangos de la mañana a la noche (puede no tener). */
export function horariosPorDia<T extends Horario>(horarios: T[]): { dia: number; nombre: string; rangos: T[] }[] {
  return DIAS_SEMANA.map((nombre, i) => ({
    dia: i + 1,
    nombre,
    rangos: horarios.filter((h) => h.diaSemana === i + 1).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
  }));
}

/** '08:00' → '8:00 a. m.', '13:30' → '1:30 p. m.', '24:00' → '12:00 a. m.' (medianoche). */
export function horaLegible(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const horas = Number(m[1]) % 24;
  const sufijo = horas < 12 ? 'a. m.' : 'p. m.';
  return `${horas % 12 === 0 ? 12 : horas % 12}:${m[2]} ${sufijo}`;
}

/** '25.000', '$25,000' o '25000' → 25000. Solo dígitos; null si no hay número. */
export function leerPesos(textoPrecio: string): number | null {
  const digitos = textoPrecio.replace(/\D/g, '');
  if (!digitos || digitos.length > 9) return null;
  return Number(digitos);
}

/** Un entero en el texto ('45'), o null si no lo es. */
export function leerEntero(textoNumero: string): number | null {
  return /^\d{1,7}$/.test(textoNumero.trim()) ? Number(textoNumero.trim()) : null;
}

export type EstadoUsuario = 'activo' | 'pendiente' | 'desactivado';

export interface UsuarioDelNegocio {
  id: string;
  email: string;
  nombre: string;
  rol: 'dueno' | 'empleado';
  estado: EstadoUsuario;
  ultimoLoginEn: string | null;
  profesionalId: string | null;
}

export type AccionDeUsuario = 'reenviarInvitacion' | 'recuperacion' | 'desactivar';

/**
 * Lo que el dueño puede hacer con un usuario, con las reglas del backend: los enlaces (invitación o
 * recuperación) solo para barberos, porque quien recibe el enlace pone la contraseña; desactivar,
 * a cualquiera menos a sí mismo (para no quedarse fuera por un toque).
 */
export function accionesDeUsuario(u: Pick<UsuarioDelNegocio, 'id' | 'rol' | 'estado'>, yo: string): AccionDeUsuario[] {
  const acciones: AccionDeUsuario[] = [];
  if (u.rol === 'empleado') acciones.push(u.estado === 'activo' ? 'recuperacion' : 'reenviarInvitacion');
  if (u.id !== yo && u.estado !== 'desactivado') acciones.push('desactivar');
  return acciones;
}

/** Mensaje para enviar el enlace por WhatsApp, ya listo para wa.me/?text=. */
export function mensajeConEnlace(tipo: 'invitacion' | 'recuperacion', nombreNegocio: string, enlace: string): string {
  const inicio = tipo === 'invitacion' ? `Te invito al panel de ${nombreNegocio} en Turnoo. Entra aquí y crea tu contraseña:` : `Para poner una contraseña nueva en el panel de ${nombreNegocio}, entra aquí:`;
  return `${inicio}\n${enlace}\n\nEl enlace sirve una sola vez.`;
}

// ---------------------------------------------------------------------
// Ajustes del negocio
// ---------------------------------------------------------------------

export interface Configuracion {
  intervaloMinutos: number;
  anticipacionMinMinutos: number;
  anticipacionMaxDias: number;
  maxCitasActivasCliente: number | null;
  horasLimiteCancelacion: number;
  horasRecordatorio: number;
  recordatorioNoAntesDe: string;
  recordatorioNoDespuesDe: string;
  maxInasistencias: number;
  ventanaInasistenciasDias: number;
  horasEsperaAprobacion: number;
  aprobacionMinutosAntesCita: number;
  horasModoHumano: number;
  horasAutocompletarCita: number;
}

export type ClaveConfiguracion = keyof Configuracion;

interface CampoNumero {
  clave: ClaveConfiguracion;
  tipo: 'numero';
  etiqueta: string;
  ayuda: string;
  unidad: string;
  min: number;
  max: number;
  /** Vacío = sin límite (se guarda null). */
  opcional?: true;
}
interface CampoHora {
  clave: ClaveConfiguracion;
  tipo: 'hora';
  etiqueta: string;
  ayuda: string;
}
interface CampoIntervalo {
  clave: 'intervaloMinutos';
  tipo: 'intervalo';
  etiqueta: string;
  ayuda: string;
  opciones: readonly number[];
}
export type CampoDeConfiguracion = CampoNumero | CampoHora | CampoIntervalo;

/** Mismos rangos que el backend (negocios.rutas.ts), para avisar antes de enviar. */
/** `id`: el ancla de la sección en Ajustes (/negocio#recordatorios). */
export const GRUPOS_DE_CONFIGURACION: { id: string; titulo: string; campos: CampoDeConfiguracion[] }[] = [
  {
    id: 'agenda',
    titulo: 'Agenda',
    campos: [
      { clave: 'intervaloMinutos', tipo: 'intervalo', etiqueta: 'Horas que se ofrecen cada', ayuda: 'Cada cuánto empieza una hora libre: 8:00, 8:15, 8:30…', opciones: [5, 10, 15, 20, 30, 60] },
      { clave: 'anticipacionMinMinutos', tipo: 'numero', etiqueta: 'Anticipación mínima', ayuda: 'No se agendan citas que empiecen antes de este tiempo.', unidad: 'minutos', min: 0, max: 43_200 },
      { clave: 'anticipacionMaxDias', tipo: 'numero', etiqueta: 'Agendar como máximo con', ayuda: 'Hasta cuántos días adelante se puede pedir cita.', unidad: 'días', min: 1, max: 365 },
      { clave: 'maxCitasActivasCliente', tipo: 'numero', etiqueta: 'Citas activas por cliente', ayuda: 'Cuántas citas futuras puede tener a la vez. Vacío: sin límite.', unidad: 'citas', min: 1, max: 100, opcional: true },
    ],
  },
  {
    id: 'cancelaciones',
    titulo: 'Cancelaciones e inasistencias',
    campos: [
      { clave: 'horasLimiteCancelacion', tipo: 'numero', etiqueta: 'El cliente cancela hasta', ayuda: 'Horas antes de la cita en que el asistente aún acepta cancelar o cambiar.', unidad: 'horas antes', min: 0, max: 720 },
      { clave: 'maxInasistencias', tipo: 'numero', etiqueta: 'Inasistencias permitidas', ayuda: 'Con más inasistencias que estas, el asistente ya no le agenda solo.', unidad: 'veces', min: 1, max: 100 },
      { clave: 'ventanaInasistenciasDias', tipo: 'numero', etiqueta: 'Se cuentan las de los últimos', ayuda: 'Las inasistencias más viejas se olvidan.', unidad: 'días', min: 1, max: 365 },
    ],
  },
  {
    id: 'recordatorios',
    titulo: 'Recordatorios',
    campos: [
      { clave: 'horasRecordatorio', tipo: 'numero', etiqueta: 'Recordar la cita', ayuda: 'Cuánto antes se le escribe al cliente por WhatsApp.', unidad: 'horas antes', min: 1, max: 168 },
      { clave: 'recordatorioNoAntesDe', tipo: 'hora', etiqueta: 'No enviar antes de las', ayuda: 'Para no escribirle de madrugada.' },
      { clave: 'recordatorioNoDespuesDe', tipo: 'hora', etiqueta: 'Ni después de las', ayuda: 'Debe ser más tarde que la anterior.' },
    ],
  },
  {
    id: 'por-aprobar',
    titulo: 'Citas por aprobar',
    campos: [
      { clave: 'horasEsperaAprobacion', tipo: 'numero', etiqueta: 'Plazo para aprobar', ayuda: 'Si no la apruebas en este tiempo, se cancela sola.', unidad: 'horas', min: 1, max: 168 },
      { clave: 'aprobacionMinutosAntesCita', tipo: 'numero', etiqueta: 'Y como tarde', ayuda: 'El plazo vence también este tiempo antes de la cita.', unidad: 'minutos antes', min: 0, max: 10_080 },
    ],
  },
  {
    id: 'asistente',
    titulo: 'Asistente y cierre de citas',
    campos: [
      { clave: 'horasModoHumano', tipo: 'numero', etiqueta: 'Cuando pasa a una persona, el asistente calla', ayuda: 'Tiempo en que el asistente no responde a ese cliente.', unidad: 'horas', min: 1, max: 168 },
      { clave: 'horasAutocompletarCita', tipo: 'numero', etiqueta: 'Marcar completada sola después de', ayuda: 'Si nadie la marca, se da por completada este tiempo después de terminar.', unidad: 'horas', min: 1, max: 720 },
    ],
  },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Del formulario a los cambios: solo lo que es distinto de lo actual (el backend rechaza un cambio
 * vacío). Devuelve el primer error con el nombre del campo, como lo vería el dueño.
 */
export function cambiosDeConfiguracion(
  leer: (clave: ClaveConfiguracion) => string,
  actual: Configuracion,
  /** Solo estos campos (una sección de Ajustes); sin indicar, todos. */
  campos: CampoDeConfiguracion[] = GRUPOS_DE_CONFIGURACION.flatMap((g) => g.campos),
): { cambios: Partial<Configuracion> } | { error: string } {
  const cambios: Partial<Configuracion> = {};
  for (const campo of campos) {
    const valor = leer(campo.clave).trim();
    let nuevo: number | string | null;
    if (campo.tipo === 'hora') {
      if (!HORA.test(valor)) return { error: `${campo.etiqueta}: escribe una hora.` };
      nuevo = valor;
    } else if (campo.tipo === 'intervalo') {
      const n = leerEntero(valor);
      if (n === null || !campo.opciones.includes(n)) return { error: `${campo.etiqueta}: elige una de las opciones.` };
      nuevo = n;
    } else if (valor === '' && campo.opcional) {
      nuevo = null;
    } else {
      const n = leerEntero(valor);
      if (n === null || n < campo.min || n > campo.max) return { error: `${campo.etiqueta}: escribe un número entre ${campo.min} y ${campo.max}.` };
      nuevo = n;
    }
    if (nuevo !== actual[campo.clave]) (cambios as Record<string, unknown>)[campo.clave] = nuevo;
  }
  return { cambios };
}
