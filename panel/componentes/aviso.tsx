import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';

const TIPOS = {
  error: { clases: 'bg-peligro-suave text-peligro', Icono: CircleAlert, rol: 'alert' },
  exito: { clases: 'bg-exito-suave text-exito', Icono: CircleCheck, rol: 'status' },
  info: { clases: 'bg-marca-suave text-marca-oscura', Icono: Info, rol: 'status' },
} as const;

/** Mensaje con ícono y texto (nunca solo color). Los errores se anuncian al lector de pantalla. */
export function Aviso({ tipo, children }: { tipo: keyof typeof TIPOS; children: ReactNode }) {
  const { clases, Icono, rol } = TIPOS[tipo];
  return (
    <div role={rol} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${clases}`}>
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
