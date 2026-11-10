'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Envuelve la grilla del escritorio cuando hay barberos que no trabajan ese día: sus columnas
 * (marcadas por la grilla) se esconden y una línea dice quiénes son, con "Mostrar todos". Se
 * decide en el navegador, sin recargar; el refresco de cada minuto no lo deshace.
 */
export function BarberosSinTurno({
  nombres,
  columnas,
  children,
}: {
  /** Los que no trabajan, en el orden de la grilla. */
  nombres: string[];
  /** Columnas en total (con los que no trabajan). */
  columnas: number;
  children: ReactNode;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? columnas : columnas - nombres.length;
  const nadie = visibles === 0;
  return (
    <div data-todos={todos ? 'si' : undefined} className="group/turnos" style={{ '--columnas': Math.max(visibles, 1) } as CSSProperties}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-suave">
        <p>
          {nadie ? 'Ningún barbero trabaja este día.' : `No ${nombres.length === 1 ? 'trabaja' : 'trabajan'} este día: ${lista(nombres)}.`}
        </p>
        <button
          type="button"
          aria-expanded={todos}
          aria-controls="grilla-del-dia"
          onClick={() => setTodos((antes) => !antes)}
          className="-mx-2 flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-medium text-marca transition-colors duration-150 hover:bg-hundido"
        >
          {todos ? 'Ocultar a los que no trabajan' : 'Mostrar todos'}
        </button>
      </div>
      <div className={nadie ? 'hidden' : undefined}>{children}</div>
    </div>
  );
}

/** 'A', 'A y B', 'A, B y C'. */
function lista(nombres: string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}
