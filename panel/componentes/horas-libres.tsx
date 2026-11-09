import type { HoraLibre } from '@/lib/agenda';

/** '9:30 a. m.' → { numero: '9:30', sufijo: ' a. m.' }. */
function partir(etiqueta: string): { numero: string; sufijo: string } {
  const m = /^(.*?)(\s?[ap]\.\s?m\.)$/.exec(etiqueta);
  return m ? { numero: m[1]!, sufijo: m[2]! } : { numero: etiqueta, sufijo: '' };
}

/**
 * Horas libres como botones, agrupadas en mañana, tarde y noche. El radio va oculto pero DENTRO
 * de su botón (relative): así, al enfocarlo con el teclado, la página no salta. Va dentro de un
 * <form>; envía `inicio` con el instante ISO que dio el backend. Las horas llegan ya escritas
 * (lib/agenda.ts): este componente no carga luxon y sirve en el servidor y en el navegador.
 */
export function HorasLibres({ horas, elegida }: { horas: HoraLibre[]; elegida?: string | undefined }) {
  if (horas.length === 0) {
    return <p className="rounded-xl border border-dashed border-borde bg-superficie p-4 text-center text-sm text-suave">No hay horas libres este día. Prueba otro.</p>;
  }
  const franjas = (['Mañana', 'Tarde', 'Noche'] as const)
    .map((nombre) => ({ nombre, horas: horas.filter((h) => h.franja === nombre) }))
    .filter((f) => f.horas.length > 0);
  const primera = horas[0]?.inicio;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Hora</legend>
      {franjas.map((franja) => (
        <div key={franja.nombre} role="group" aria-label={franja.nombre}>
          <p aria-hidden className="mb-1.5 text-xs font-semibold tracking-wide text-suave uppercase">
            {franja.nombre} <span className="font-normal tracking-normal normal-case">· {franja.horas.length === 1 ? '1 hora' : `${franja.horas.length} horas`}</span>
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {franja.horas.map((h) => (
              <label
                key={h.inicio}
                className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-borde bg-superficie px-1 text-sm font-medium whitespace-nowrap tabular-nums transition-colors duration-150 hover:bg-fondo has-[:checked]:border-marca has-[:checked]:bg-marca has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca"
              >
                <input
                  type="radio"
                  name="inicio"
                  value={h.inicio}
                  data-etiqueta={h.etiqueta}
                  defaultChecked={h.inicio === elegida}
                  required={h.inicio === primera}
                  className="sr-only"
                />
                {/* "9:30" se ve (la franja ya dice si es mañana o tarde); "a. m." queda para el lector de pantalla. */}
                {partir(h.etiqueta).numero}
                <span className="sr-only">{partir(h.etiqueta).sufijo}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
