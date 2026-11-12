import { ChevronRight, Scissors } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Campo } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { barberos as leerBarberos, usuarios as leerUsuarios } from '@/lib/datos';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { crearBarbero } from '../acciones';

export const metadata: Metadata = { title: SECCIONES.equipo.etiqueta };

/** Los barberos del negocio: activos primero. Cada uno abre sus servicios, horario y acceso. */
export default async function PaginaEquipo() {
  await exigirUsuario('equipo');
  const [barberos, usuarios] = await Promise.all([leerBarberos(), leerUsuarios()]);
  const nombreDeUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const ordenados = [...barberos].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));

  return (
    <div className="ancho-lista">
      <h1 className="text-2xl font-semibold">Barberos y servicios</h1>
      <p className="mb-4 text-sm text-suave">Toca un barbero para cambiar sus servicios, precios, horario y acceso al panel.</p>

      {ordenados.length === 0 ? (
        <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
          <Scissors aria-hidden className="size-8" />
          <p>Todavía no hay barberos. Agrega el primero abajo.</p>
        </div>
      ) : (
        <ul className="mb-6 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
          {ordenados.map((b) => (
            <li key={b.id}>
              <Link href={`/equipo/${b.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-fondo">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${b.activo ? '' : 'text-suave'}`}>{b.nombre}</span>
                  <span className="block truncate text-sm text-suave">
                    {b.activo ? (b.usuarioId ? `Entra al panel: ${nombreDeUsuario.get(b.usuarioId) ?? 'usuario'}` : 'Sin acceso al panel') : 'Inactivo: no recibe citas'}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="nuevo-barbero" className="rounded-xl border border-borde bg-superficie p-4">
        <h2 id="nuevo-barbero" className="mb-3 font-semibold">
          Agregar barbero
        </h2>
        <FormularioConEstado accion={crearBarbero} boton="Agregar barbero" enviando="Agregando…">
          <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} autoComplete="off" ayuda="Como lo verán los clientes en WhatsApp." />
        </FormularioConEstado>
      </section>
    </div>
  );
}
