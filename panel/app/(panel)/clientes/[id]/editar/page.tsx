import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Campo } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { clienteEditable } from '@/lib/datos';
import { editarCliente } from '../../acciones';

export const metadata: Metadata = { title: 'Editar cliente' };

export default async function PaginaEditarCliente({ params }: { params: Promise<{ id: string }> }) {
  const c = await clienteEditable((await params).id);

  return (
    <div className="ancho-formulario">
      <Link href={`/clientes/${c.id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Cliente
      </Link>
      <h1 className="mb-4 text-2xl font-semibold">Editar cliente</h1>
      <FormularioConEstado accion={editarCliente.bind(null, c.id)} boton="Guardar cambios" enviando="Guardando…">
        <Campo id="nombre" name="nombre" etiqueta="Nombre" defaultValue={c.nombre ?? ''} maxLength={100} autoComplete="off" />
        <Campo
          id="telefono"
          name="telefono"
          etiqueta="Teléfono (WhatsApp)"
          type="tel"
          inputMode="tel"
          required
          defaultValue={c.telefono ? `+${c.telefono}` : ''}
          ayuda="Con el indicativo del país, por ejemplo +57 300 123 4567."
          autoComplete="off"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notas" className="text-sm font-medium">
            Notas
          </label>
          <textarea
            id="notas"
            name="notas"
            defaultValue={c.notas ?? ''}
            rows={4}
            maxLength={2000}
            aria-describedby="notas-ayuda"
            className="rounded-lg border border-borde bg-superficie px-3 py-2 text-base"
          />
          <p id="notas-ayuda" className="text-sm text-suave">
            Solo las ve el equipo. Por ejemplo: prefiere la máquina en 2.
          </p>
        </div>
      </FormularioConEstado>
    </div>
  );
}
