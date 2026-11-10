import Link from 'next/link';

/**
 * En el escritorio, junto a "Sigue": cuántas citas tiene el día, cuántas ya se completaron y
 * cuántas esperan aprobación (sin plata: lo decidió el dueño). "Por aprobar" lleva a su pantalla
 * cuando hay alguna y quien mira puede aprobarlas.
 */
export function ResumenDelDia({
  citas,
  completadas,
  porAprobar,
  enlacePorAprobar,
}: {
  citas: number;
  completadas: number;
  porAprobar: number;
  enlacePorAprobar?: string | undefined;
}) {
  const dato = 'cifras text-2xl leading-tight font-bold';
  return (
    <section aria-labelledby="resumen-titulo" className="rounded-xl border border-borde bg-superficie p-4">
      <h2 id="resumen-titulo" className="mb-2 text-sm font-semibold tracking-wide text-suave uppercase">
        Resumen del día
      </h2>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div className="flex flex-col-reverse">
          <dt className="text-sm text-suave">{citas === 1 ? 'Cita' : 'Citas'}</dt>
          <dd className={`${dato} text-texto`}>{citas}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-sm text-suave">{completadas === 1 ? 'Completada' : 'Completadas'}</dt>
          <dd className={`${dato} text-texto`}>{completadas}</dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className="text-sm text-suave">Por aprobar</dt>
          <dd className={`${dato} ${porAprobar > 0 ? 'text-aviso' : 'text-texto'}`}>
            {porAprobar > 0 && enlacePorAprobar ? (
              <Link href={enlacePorAprobar} className="underline decoration-2 underline-offset-4 hover:decoration-aviso" aria-label={`${porAprobar} por aprobar: ver`}>
                {porAprobar}
              </Link>
            ) : (
              porAprobar
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
