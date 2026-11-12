import type { ReactNode } from 'react';
import { configuracion } from '@/lib/configuracion';
import { enlaceDeSoporte } from '@/lib/soporte';

/**
 * "soporte de Turnoo" con enlace al WhatsApp del soporte, si está configurado (SOPORTE_WHATSAPP).
 * Sin la variable queda el mismo texto, sin enlace. Hereda el color del aviso donde va.
 */
export function Soporte({ children = 'soporte de Turnoo' }: { children?: ReactNode }) {
  const numero = configuracion.soporteWhatsapp;
  if (!numero) return <>{children}</>;
  return (
    <a href={enlaceDeSoporte(numero)} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2 hover:no-underline">
      {children}
    </a>
  );
}
