import { Ban, CircleCheckBig, CircleDashed, Clock, Hourglass, UserX, type LucideIcon } from 'lucide-react';
import { ESTADOS, type EstadoCita } from '@/lib/citas';

const ICONOS: Record<EstadoCita, LucideIcon> = {
  por_aprobar: Hourglass,
  pendiente: Clock,
  confirmada: CircleDashed,
  completada: CircleCheckBig,
  no_asistio: UserX,
  cancelada: Ban,
};

/** Estado de la cita con ícono y texto: nunca solo color. */
export function InsigniaEstado({ estado }: { estado: EstadoCita }) {
  const Icono = ICONOS[estado];
  const { etiqueta, clases } = ESTADOS[estado];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${clases}`}>
      <Icono aria-hidden className="size-3.5" />
      {etiqueta}
    </span>
  );
}
