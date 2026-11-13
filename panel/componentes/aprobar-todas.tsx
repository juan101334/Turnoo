'use client';

import { CheckCheck } from 'lucide-react';
import { aprobarCitas } from '@/app/(panel)/citas/acciones';
import type { CitaConHistorial } from '@/lib/citas';
import { AccionEnLote, type TextosDelLote } from './accion-en-lote';
import { useAccionDiferida } from './accion-diferida';
import { HistorialDelCliente } from './historial-del-cliente';

export interface CitaParaAprobar extends Pick<CitaConHistorial, 'clienteCitasCompletadas' | 'clienteInasistencias'> {
  id: string;
  /** "Mañana 10:00 · Ana · Carlos". */
  nombre: string;
}

const textos = (soloLasPrimeras: boolean): TextosDelLote => ({
  franja: (cantidad) => (
    <>
      <span className="font-semibold">{cantidad}</span> esperan tu aprobación.
    </>
  ),
  boton: (n) => (soloLasPrimeras ? `Aprobar las ${n} primeras` : 'Aprobar todas'),
  enviando: 'Aprobando…',
  titulo: (cantidad) => `¿Aprobar ${cantidad}?`,
  confirmar: 'Aprobar',
  hechas: (n) => (n === 1 ? '1 cita aprobada.' : `${n} citas aprobadas.`),
  fallidas: (n) => (n === 1 ? 'No se pudo aprobar 1 cita:' : `No se pudieron aprobar ${n} citas:`),
  lista: 'Citas que se aprueban',
});

/**
 * "Aprobar todas" en Por aprobar (ver AccionEnLote). La confirmación lista cada cita con el
 * historial de su cliente, para que un cliente que ya faltó no pase sin verlo.
 */
export function AprobarTodas({ citas, soloLasPrimeras }: { citas: CitaParaAprobar[]; soloLasPrimeras: boolean }) {
  const { hechas } = useAccionDiferida();
  // Las aprobadas a mano (aún en su "Deshacer") no van en el lote: tampoco cuentan aquí.
  const conFaltas = citas.filter((c) => !hechas.has(c.id) && c.clienteInasistencias > 0).length;
  return (
    <AccionEnLote
      elementos={citas.map((c) => ({ id: c.id, nombre: c.nombre, detalle: <HistorialDelCliente cita={c} className="mt-0.5 mb-1.5" /> }))}
      accion={aprobarCitas}
      textos={textos(soloLasPrimeras)}
      icono={CheckCheck}
      nota={
        <>
          {conFaltas > 0 && (
            <p className="font-medium text-peligro">
              {conFaltas === 1 ? '1 cliente ya faltó antes.' : `${conFaltas} clientes ya faltaron antes.`} Si prefieres revisarlas una por una,
              cancela.
            </p>
          )}
          <p>Cada cliente recibe por WhatsApp el aviso de que su cita quedó aprobada.</p>
        </>
      }
    />
  );
}
