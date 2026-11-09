export interface ClienteResumen {
  id: string;
  nombre: string | null;
  /** Solo dígitos con indicativo, el mismo formato que usa WhatsApp (ej. 573001234567). */
  telefono: string;
  /** true si este llamado lo creó; false si ya existía. */
  creado: boolean;
}

/** El cliente que escribe por WhatsApp: se conoce por su teléfono, su BSUID o ambos. */
export interface ClienteDeWhatsapp {
  id: string;
  nombre: string | null;
  telefono: string | null;
  /** BSUID de WhatsApp. No se muestra en el panel: solo sirve para reconocer y responder. */
  waUserId: string | null;
  creado: boolean;
}

export interface EntradaCliente {
  /** Se acepta con espacios, guiones, paréntesis o "+". */
  telefono: string;
  nombre?: string;
}

/** Lo que el panel ve de un cliente. Si está anonimizado, sus datos personales son null. */
export interface Cliente {
  id: string;
  nombre: string | null;
  telefono: string | null;
  notas: string | null;
  anonimizadoEn: Date | null;
  createdAt: Date;
}

/**
 * Un cliente en la lista, con un resumen de sus citas. Para el empleado, el resumen cuenta solo
 * las citas con su barbero, igual que el historial que puede ver.
 */
export interface ClienteDeLista extends Cliente {
  /** Inicio de la última cita completada. */
  ultimaVisita: Date | null;
  /** Inicio de la próxima cita activa (por aprobar, pendiente o confirmada) que aún no empieza. */
  proximaCita: Date | null;
  /** Citas que no se cancelaron: completadas, inasistencias y activas. */
  totalCitas: number;
}

export const ORDENES_CLIENTES = ['nombre', 'ultima_visita', 'proxima_cita', 'total_citas', 'reciente'] as const;
/** reciente: el último cliente creado o agendado primero (para elegirlo rápido en Nueva cita). */
export type OrdenClientes = (typeof ORDENES_CLIENTES)[number];

export interface FiltroClientes {
  /** Solo los que tienen citas con este barbero. null = todo el negocio. */
  profesionalId: string | null;
  /** Parte del nombre o del teléfono. Sin importar tildes ni mayúsculas. */
  buscar: string | null;
  orden: OrdenClientes;
  direccion: 'asc' | 'desc';
  limite: number;
  desplazamiento: number;
}

export interface CambiosCliente {
  nombre?: string | null | undefined;
  telefono?: string | undefined;
  notas?: string | null | undefined;
}
