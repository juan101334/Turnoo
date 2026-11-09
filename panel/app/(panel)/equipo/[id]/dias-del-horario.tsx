'use client';

import { DIAS_SEMANA } from '@/lib/administracion';

/**
 * Los días a los que se agrega el rango: casillas (sirven sin JavaScript) y dos atajos para lo
 * más común. Así una semana igual se carga de una vez, no día por día.
 */
export function DiasDelHorario() {
  const marcar = (evento: React.MouseEvent<HTMLButtonElement>, dias: number[]) => {
    const grupo = evento.currentTarget.closest('fieldset');
    grupo?.querySelectorAll<HTMLInputElement>('input[name="dias"]').forEach((c) => {
      c.checked = dias.includes(Number(c.value));
    });
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Días</legend>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {DIAS_SEMANA.map((nombre, i) => (
          <label
            key={nombre}
            className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-borde bg-superficie text-sm font-medium transition-colors duration-150 hover:bg-fondo has-[:checked]:border-marca has-[:checked]:bg-marca has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca"
          >
            <input type="checkbox" name="dias" value={i + 1} className="sr-only" />
            <span aria-hidden>{nombre.slice(0, 3)}</span>
            <span className="sr-only">{nombre}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={(e) => marcar(e, [1, 2, 3, 4, 5])} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave">
          De lunes a viernes
        </button>
        <button type="button" onClick={(e) => marcar(e, [1, 2, 3, 4, 5, 6])} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave">
          De lunes a sábado
        </button>
        <button type="button" onClick={(e) => marcar(e, [1, 2, 3, 4, 5, 6, 7])} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave">
          Todos
        </button>
      </div>
    </fieldset>
  );
}
