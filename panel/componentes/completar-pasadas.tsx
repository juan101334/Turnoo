'use client';

import { CheckCheck } from 'lucide-react';
import { completarCitas } from '@/app/(panel)/citas/acciones';
import { AccionEnLote, type TextosDelLote } from './accion-en-lote';

export interface CitaPasada {
  id: string;
  hora: string;
  cliente: string;
  /** Solo si el dueño ve a todo el equipo. */
  barbero?: string | undefined;
}

const nombre = (c: CitaPasada) => `${c.hora} · ${c.cliente}${c.barbero ? ` · ${c.barbero}` : ''}`;

const TEXTOS: TextosDelLote = {
  franja: (cantidad) => (
    <>
      <span className="font-semibold">{cantidad}</span> ya terminaron y siguen sin marcar.
    </>
  ),
  boton: (n) => `Marcar las ${n} como completadas`,
  enviando: 'Marcando…',
  titulo: (cantidad) => `¿Marcar ${cantidad} como completadas?`,
  confirmar: 'Marcar como completadas',
  hechas: (n) => (n === 1 ? '1 cita marcada como completada.' : `${n} citas marcadas como completadas.`),
  fallidas: (n) => (n === 1 ? 'No se pudo marcar 1 cita:' : `No se pudieron marcar ${n} citas:`),
  lista: 'Citas que se marcan',
};

/**
 * En Hoy: las citas que ya terminaron y nadie marcó, todas de una vez (ver AccionEnLote). Con una
 * sola no aparece: para eso está "Completada" en su tarjeta.
 */
export function CompletarPasadas({ citas }: { citas: CitaPasada[] }) {
  return (
    <AccionEnLote
      elementos={citas.map((c) => ({ id: c.id, nombre: nombre(c) }))}
      accion={completarCitas}
      textos={TEXTOS}
      icono={CheckCheck}
      nota={<p>Si alguien no vino, cámbiala después a &quot;No asistió&quot; en su detalle.</p>}
    />
  );
}
