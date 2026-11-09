import { CircleCheck, CircleDashed } from 'lucide-react';
import Link from 'next/link';
import { barberos, conocimiento, horariosDe, miNegocio, serviciosDe, siSePuede } from '@/lib/datos';

interface Paso {
  titulo: string;
  detalle: string;
  href: string;
  listo: boolean;
}

/** El primer barbero activo que cumple `prueba` (se pregunta de a uno: casi siempre el primero basta). */
async function algunBarbero(ids: string[], prueba: (id: string) => Promise<boolean>): Promise<boolean> {
  for (const id of ids) if (await prueba(id)) return true;
  return false;
}

/**
 * Para el dueño nuevo, arriba de Hoy: lo que falta para que el asistente pueda agendar. Cada paso
 * lleva a donde se hace y se marca solo cuando ya está. Desaparece al completarlos todos.
 * Si alguna consulta falla, no se muestra (no debe estorbar la agenda).
 */
export async function PrimerosPasos() {
  const datos = await siSePuede(async () => {
    const [equipo, negocio, base] = await Promise.all([barberos(), miNegocio(), conocimiento()]);
    const activos = equipo.filter((b) => b.activo).map((b) => b.id);
    const [conServicios, conHorario] = await Promise.all([
      algunBarbero(activos, async (id) => (await serviciosDe(id)).some((s) => s.activo)),
      algunBarbero(activos, async (id) => (await horariosDe(id)).length > 0),
    ]);
    return { primero: activos[0], hayBarberos: activos.length > 0, conServicios, conHorario, avisos: negocio.negocio.telefonoAvisos !== null, base: base.entradas.length > 0 };
  });
  if (!datos) return null;

  const ficha = datos.primero ? `/equipo/${datos.primero}` : '/equipo';
  const pasos: Paso[] = [
    { titulo: 'Agrega a tus barberos', detalle: 'Cada uno con su agenda.', href: '/equipo', listo: datos.hayBarberos },
    { titulo: 'Ponles servicios y precios', detalle: 'Lo que el asistente ofrece.', href: `${ficha}?pestana=servicios`, listo: datos.conServicios },
    { titulo: 'Define su horario', detalle: 'Sin horario no hay horas libres.', href: `${ficha}?pestana=horario`, listo: datos.conHorario },
    { titulo: 'Escribe tu WhatsApp para avisos', detalle: 'Para enterarte cuando un cliente te necesita.', href: '/negocio#datos', listo: datos.avisos },
    { titulo: 'Enséñale al asistente', detalle: 'Parqueadero, medios de pago, dirección…', href: '/conocimiento', listo: datos.base },
  ];
  const listos = pasos.filter((p) => p.listo).length;
  if (listos === pasos.length) return null;

  return (
    <section aria-labelledby="primeros-pasos" className="mb-4 rounded-xl border border-borde bg-superficie p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="primeros-pasos" className="font-semibold">
          Primeros pasos
        </h2>
        <p className="text-sm text-suave tabular-nums">
          {listos} de {pasos.length} listos
        </p>
      </div>
      <div aria-hidden className="mb-3 h-1.5 overflow-hidden rounded-full bg-hundido">
        <div className="h-full rounded-full bg-marca" style={{ width: `${(listos / pasos.length) * 100}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {pasos.map((p) => (
          // En el celular solo lo que falta: lo hecho ya lo dice la barra.
          <li key={p.titulo} className={p.listo ? 'hidden sm:block' : undefined}>
            <Link
              href={p.href}
              className={`flex h-full min-h-14 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150 ${
                p.listo ? 'border-transparent bg-exito-suave text-suave' : 'border-borde hover:border-marca hover:bg-marca-suave'
              }`}
            >
              {p.listo ? <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-exito" /> : <CircleDashed aria-hidden className="mt-0.5 size-5 shrink-0 text-marca" />}
              <span>
                <span className={`block font-semibold ${p.listo ? 'line-through' : 'text-texto'}`}>{p.titulo}</span>
                <span className="block">{p.listo ? 'Listo' : p.detalle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
