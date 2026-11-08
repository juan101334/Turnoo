import { Construction } from 'lucide-react';

/** Sección que llega en un PR siguiente. Ya tiene su ruta y su permiso por rol. */
export function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{titulo}</h1>
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borde bg-superficie px-6 py-12 text-center">
        <Construction aria-hidden className="size-8 text-suave" />
        <p className="font-medium">Esta sección llega pronto</p>
        <p className="text-sm text-suave">Estamos terminando de construirla.</p>
      </div>
    </>
  );
}
