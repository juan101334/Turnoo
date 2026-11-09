import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Campo } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { barbero as leerBarbero, serviciosDe } from '@/lib/datos';
import { exigirUsuario } from '@/lib/sesion';
import { editarServicio } from '../../../acciones';

export const metadata: Metadata = { title: 'Editar servicio' };

/** Cambiar el precio o la duración no toca las citas ya agendadas: guardan lo que costaban. */
export default async function PaginaEditarServicio({ params }: { params: Promise<{ id: string; servicioId: string }> }) {
  await exigirUsuario('equipo');
  const { id, servicioId } = await params;
  const b = await leerBarbero(id);
  const s = (await serviciosDe(b.id)).find((x) => x.id === servicioId);
  if (!s) notFound();

  return (
    <div className="ancho-formulario">
      <Link href={`/equipo/${b.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        {b.nombre}
      </Link>
      <h1 className="text-2xl font-semibold">Editar servicio</h1>
      <p className="mb-4 text-sm text-suave">Las citas ya agendadas conservan el precio y la duración con que se pidieron.</p>
      <FormularioConEstado accion={editarServicio.bind(null, b.id, s.id)} boton="Guardar servicio" enviando="Guardando…">
        <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} defaultValue={s.nombre} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <Campo id="duracion" name="duracion" etiqueta="Duración (min)" required inputMode="numeric" pattern="[0-9]*" maxLength={3} defaultValue={String(s.duracionMinutos)} />
          <Campo id="precio" name="precio" etiqueta="Precio ($)" required inputMode="numeric" maxLength={13} defaultValue={new Intl.NumberFormat('es-CO').format(s.precioCop)} />
        </div>
      </FormularioConEstado>
    </div>
  );
}
