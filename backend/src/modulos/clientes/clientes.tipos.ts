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
