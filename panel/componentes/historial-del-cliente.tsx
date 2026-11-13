import { History, UserPlus, UserX } from 'lucide-react';
import { historialDelCliente, type CitaConHistorial } from '@/lib/citas';

/**
 * Si el cliente es nuevo o cuántas veces ha venido, y cuántas veces no vino (solo si faltó alguna).
 * Siempre con ícono y texto, no solo con color. Sirve en el servidor y en el cliente (sin estado).
 */
export function HistorialDelCliente({
  cita,
  className = '',
}: {
  cita: Pick<CitaConHistorial, 'clienteCitasCompletadas' | 'clienteInasistencias'>;
  className?: string;
}) {
  const { visitas, nuevo, inasistencias } = historialDelCliente(cita);
  const Visitas = nuevo ? UserPlus : History;
  return (
    <span className={`flex flex-wrap gap-1.5 text-xs font-medium ${className}`}>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${nuevo ? 'bg-marca-suave text-marca-oscura' : 'bg-fondo text-suave ring-1 ring-borde'}`}
      >
        <Visitas aria-hidden className="size-3.5" />
        {visitas}
      </span>
      {inasistencias && (
        <span className="inline-flex items-center gap-1 rounded-full bg-peligro-suave px-2 py-0.5 text-peligro">
          <UserX aria-hidden className="size-3.5" />
          {inasistencias}
        </span>
      )}
    </span>
  );
}
