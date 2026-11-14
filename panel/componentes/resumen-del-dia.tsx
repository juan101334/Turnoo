import Link from 'next/link';

/**
 * En el escritorio, bajo la fecha del encabezado: cuántas citas tiene el día, cuántas ya se
 * completaron y cuántas esperan aprobación (sin plata: lo decidió el dueño). Es una línea y no un
 * cuadro: un cuadro solo, sin "Sigue" al lado (casi siempre en Agenda), dejaba la fila vacía.
 * "Por aprobar" lleva a su pantalla cuando hay alguna y quien mira puede aprobarlas.
 */
export function ResumenDelDia({
  citas,
  completadas,
  porAprobar,
  enlacePorAprobar,
  className = '',
}: {
  citas: number;
  completadas: number;
  porAprobar: number;
  enlacePorAprobar?: string | undefined;
  className?: string;
}) {
  const cifra = 'cifras font-semibold text-texto';
  const textoPorAprobar = (
    <>
      <span className={porAprobar > 0 ? 'cifras font-semibold' : cifra}>{porAprobar}</span> por aprobar
    </>
  );
  return (
    <section aria-labelledby="resumen-titulo" className={`text-sm text-suave ${className}`}>
      <h2 id="resumen-titulo" className="sr-only">
        Resumen del día
      </h2>
      <p className="flex flex-wrap gap-x-2">
        <span>
          <span className={cifra}>{citas}</span> {citas === 1 ? 'cita' : 'citas'}
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className={cifra}>{completadas}</span> {completadas === 1 ? 'completada' : 'completadas'}
        </span>
        <span aria-hidden>·</span>
        {porAprobar > 0 && enlacePorAprobar ? (
          <Link href={enlacePorAprobar} className="font-medium text-marca underline decoration-2 underline-offset-4">
            {textoPorAprobar}
          </Link>
        ) : (
          <span>{textoPorAprobar}</span>
        )}
      </p>
    </section>
  );
}
