import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { barberos as leerBarberos } from '@/lib/datos';
import { exigirUsuario } from '@/lib/sesion';
import { FormularioInvitacion } from './formulario';

export const metadata: Metadata = { title: 'Invitar usuario' };

/** ?barbero=id llega desde la ficha del barbero y lo deja elegido. */
export default async function PaginaInvitar({ searchParams }: { searchParams: Promise<{ barbero?: string }> }) {
  const yo = await exigirUsuario('usuarios');
  const { barbero } = await searchParams;
  const libres = (await leerBarberos()).filter((b) => b.activo && b.usuarioId === null).map((b) => ({ id: b.id, nombre: b.nombre }));
  const inicial = libres.some((b) => b.id === barbero) ? barbero! : '';

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/usuarios" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Usuarios
      </Link>
      <h1 className="text-2xl font-semibold">Invitar usuario</h1>
      <p className="mb-4 text-sm text-suave">Turnoo crea un enlace para que la persona elija su contraseña. Tú se lo envías, por ejemplo por WhatsApp.</p>
      <FormularioInvitacion barberos={libres} barberoInicial={inicial} negocio={yo.negocio.nombre} />
    </div>
  );
}
