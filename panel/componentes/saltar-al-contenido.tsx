/**
 * Primer elemento al que llega el teclado: salta el menú y va directo al contenido. Solo se ve
 * cuando tiene el foco.
 */
export function SaltarAlContenido() {
  return (
    <a
      href="#contenido"
      className="sr-only z-50 rounded-lg bg-marca px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Saltar al contenido
    </a>
  );
}
