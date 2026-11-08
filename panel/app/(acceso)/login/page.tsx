import type { Metadata } from 'next';
import Link from 'next/link';
import { Aviso } from '@/componentes/aviso';
import { FormularioLogin } from './formulario';

export const metadata: Metadata = { title: 'Entrar' };

const MENSAJES: Record<string, string> = {
  invitacion: 'Tu contraseña quedó guardada. Ya puedes entrar.',
  contrasena: 'Tu contraseña se cambió. Entra con la nueva.',
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ listo?: string; vencida?: string }> }) {
  const { listo, vencida } = await searchParams;
  const mensaje = listo ? MENSAJES[listo] : undefined;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-5 text-sm text-suave">Con el correo y la contraseña de tu cuenta.</p>
      <div className="flex flex-col gap-4">
        {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        {vencida && <Aviso tipo="info">Tu sesión terminó. Vuelve a entrar.</Aviso>}
        <FormularioLogin />
        <Link href="/olvide-contrasena" className="self-center py-2 text-sm text-marca underline-offset-4 hover:underline">
          Olvidé mi contraseña
        </Link>
      </div>
    </>
  );
}
