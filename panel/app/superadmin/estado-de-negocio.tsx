import type { EstadoNegocio } from '@/lib/plan';

const ESTADOS: Record<EstadoNegocio, { etiqueta: string; clases: string }> = {
  prueba: { etiqueta: 'En prueba', clases: 'bg-aviso-suave text-aviso' },
  activo: { etiqueta: 'Activo', clases: 'bg-exito-suave text-exito' },
  suspendido: { etiqueta: 'Suspendido', clases: 'bg-peligro-suave text-peligro' },
};

export function EstadoDeNegocio({ estado }: { estado: EstadoNegocio }) {
  const { etiqueta, clases } = ESTADOS[estado];
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${clases}`}>{etiqueta}</span>;
}
