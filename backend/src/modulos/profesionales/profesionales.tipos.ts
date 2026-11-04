export interface Profesional {
  id: string;
  sedeId: string;
  /** Usuario del panel asociado: un empleado, o un dueño que también atiende. */
  usuarioId: string | null;
  nombre: string;
  activo: boolean;
  createdAt: Date;
}
