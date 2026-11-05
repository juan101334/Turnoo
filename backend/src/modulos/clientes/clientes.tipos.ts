export interface ClienteResumen {
  id: string;
  nombre: string | null;
  /** Solo dígitos con indicativo, el mismo formato que usa WhatsApp (ej. 573001234567). */
  telefono: string;
  /** true si este llamado lo creó; false si ya existía. */
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

export interface FiltroClientes {
  /** Solo los que tienen citas con este barbero. null = todo el negocio. */
  profesionalId: string | null;
  /** Parte del nombre o del teléfono. */
  buscar: string | null;
  limite: number;
  desplazamiento: number;
}

export interface CambiosCliente {
  nombre?: string | null | undefined;
  telefono?: string | undefined;
  notas?: string | null | undefined;
}
