import { MonitorSmartphone } from 'lucide-react';
import { BotonDeAccion, type ResultadoDeAccion } from './boton-de-accion';

/**
 * Cerrar la sesión en los demás celulares y computadores, sin cambiar la contraseña. Pide
 * confirmación: no se deshace (allá hay que volver a entrar). Esta sesión sigue abierta.
 */
export function SeccionOtrosDispositivos({ accion }: { accion: () => Promise<ResultadoDeAccion> }) {
  return (
    <section aria-labelledby="titulo-otros-dispositivos" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
      <h2 id="titulo-otros-dispositivos" className="mb-1 flex items-center gap-2 font-semibold">
        <MonitorSmartphone aria-hidden className="size-5 text-marca" />
        Otros dispositivos
      </h2>
      <p className="mb-3 text-sm text-suave">Si entraste en un celular o computador que ya no usas o que no es tuyo, cierra la sesión allá desde aquí.</p>
      <BotonDeAccion
        etiqueta="Cerrar sesión en los demás dispositivos"
        enviando="Cerrando…"
        accion={accion}
        confirmar={{ pregunta: '¿Cerrar la sesión en los demás dispositivos?', detalle: 'Allá tendrán que volver a entrar con tu contraseña. Aquí sigues dentro.', boton: 'Cerrar sesiones' }}
      />
    </section>
  );
}
