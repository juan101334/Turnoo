import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { conocimiento } from '@/lib/datos';
import { exigirUsuario } from '@/lib/sesion';
import { editarEntrada } from '../acciones';
import { CamposDeEntrada } from '../campos';

export const metadata: Metadata = { title: 'Editar pregunta' };

export default async function PaginaEditarEntrada({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario('conocimiento');
  const { id } = await params;
  const e = (await conocimiento()).entradas.find((x) => x.id === id);
  if (!e) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/conocimiento" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Base de conocimiento
      </Link>
      <h1 className="mb-4 text-2xl font-semibold">Editar pregunta</h1>
      <FormularioConEstado accion={editarEntrada.bind(null, e.id)} boton="Guardar cambios" enviando="Guardando…">
        <CamposDeEntrada prefijo="editar" pregunta={e.pregunta} respuesta={e.respuesta} />
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" name="activo" value="si" defaultChecked={e.activo} className="size-5 accent-marca" />
          <span>El asistente la usa</span>
        </label>
      </FormularioConEstado>
    </div>
  );
}
