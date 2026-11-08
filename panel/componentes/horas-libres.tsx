import type { Hueco } from '@/lib/datos';
import { horaDelDia, horaLocal } from '@/lib/fechas';

/**
 * Horas libres como botones grandes (radios con estilo de botón). El radio va oculto pero DENTRO de
 * su botón (relative): así, al enfocarlo con el teclado, la página no salta. Va dentro de un <form>;
 * envía `inicio` con el instante ISO que dio el backend.
 */
export function HorasLibres({ huecos, zona }: { huecos: Hueco[]; zona: string }) {
  if (huecos.length === 0) {
    return <p className="rounded-xl border border-dashed border-borde bg-superficie p-4 text-center text-sm text-suave">No hay horas libres este día. Prueba otro.</p>;
  }
  // Agrupadas por franja: con 40 horas seguidas cuesta encontrar "las 4 de la tarde".
  const hora = (h: Hueco) => horaDelDia(h.inicio, zona);
  const franjas = [
    { nombre: 'Mañana', huecos: huecos.filter((h) => hora(h) < 12) },
    { nombre: 'Tarde', huecos: huecos.filter((h) => hora(h) >= 12 && hora(h) < 18) },
    { nombre: 'Noche', huecos: huecos.filter((h) => hora(h) >= 18) },
  ].filter((franja) => franja.huecos.length > 0);
  const primero = huecos[0]?.inicio;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Hora</legend>
      {franjas.map((franja) => (
        <div key={franja.nombre}>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-suave uppercase">{franja.nombre}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {franja.huecos.map((h) => (
              <label
                key={h.inicio}
                className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-borde bg-superficie text-sm font-medium tabular-nums transition-colors duration-150 hover:bg-fondo has-[:checked]:border-marca has-[:checked]:bg-marca has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca"
              >
                <input type="radio" name="inicio" value={h.inicio} required={h.inicio === primero} className="sr-only" />
                {horaLocal(h.inicio, zona)}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
