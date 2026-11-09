import { ChevronDown, Ellipsis, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import { AccionPrincipal } from '@/componentes/accion-principal';
import { BotonDeAccion } from '@/componentes/boton-de-accion';
import { accionesDeUsuario, type EstadoUsuario } from '@/lib/administracion';
import { barberos as leerBarberos, usuarios as leerUsuarios } from '@/lib/datos';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { desactivarUsuario } from './acciones';
import { GenerarEnlace } from './generar-enlace';

export const metadata: Metadata = { title: SECCIONES.usuarios.etiqueta };

const ESTADOS: Record<EstadoUsuario, { etiqueta: string; clases: string }> = {
  activo: { etiqueta: 'Activo', clases: 'bg-exito-suave text-exito' },
  pendiente: { etiqueta: 'Invitación pendiente', clases: 'bg-aviso-suave text-aviso' },
  desactivado: { etiqueta: 'Desactivado', clases: 'bg-fondo text-suave ring-1 ring-borde' },
};

/** Quién entra al panel. Los barberos ven solo su agenda; los dueños, todo. */
export default async function PaginaUsuarios() {
  const yo = await exigirUsuario('usuarios');
  const zona = yo.negocio.zonaHoraria;
  const [usuarios, barberos] = await Promise.all([leerUsuarios(), leerBarberos()]);
  const nombreDeBarbero = new Map(barberos.map((b) => [b.id, b.nombre]));
  const orden: Record<EstadoUsuario, number> = { activo: 0, pendiente: 1, desactivado: 2 };
  const ordenados = [...usuarios].sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));

  return (
    <div className="ancho-lista">
      <div className="mb-1 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <AccionPrincipal href="/usuarios/invitar" etiqueta="Invitar" Icono={UserPlus} />
      </div>
      <p className="mb-4 text-sm text-suave">Quién entra al panel. Un barbero ve solo su agenda y sus clientes; un dueño ve y cambia todo.</p>

      <ul className="flex flex-col gap-2">
        {ordenados.map((u) => {
          const estado = ESTADOS[u.estado];
          const acciones = accionesDeUsuario(u, yo.usuarioId);
          const enlace = acciones.find((a) => a !== 'desactivar');
          return (
            <li key={u.id} className="rounded-xl border border-borde bg-superficie p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    {u.nombre}
                    {u.id === yo.usuarioId && <span className="text-suave"> (tú)</span>}
                  </p>
                  <p className="text-sm break-all text-suave">{u.email}</p>
                  <p className="text-sm text-suave">
                    {u.rol === 'dueno' ? 'Dueño' : 'Barbero'}
                    {u.profesionalId && ` · atiende como ${nombreDeBarbero.get(u.profesionalId) ?? 'barbero'}`}
                    {u.ultimoLoginEn && ` · entró el ${fechaLarga(fechaDe(u.ultimoLoginEn, zona))}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${estado.clases}`}>{estado.etiqueta}</span>
              </div>
              {acciones.length > 0 && (
                // Las acciones van plegadas: la lista se lee de un vistazo y nada se toca sin querer.
                <details className="group mt-2">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave [&::-webkit-details-marker]:hidden">
                    <Ellipsis aria-hidden className="size-4" />
                    Acciones
                    <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 border-t border-borde pt-3">
                    {enlace && <GenerarEnlace usuarioId={u.id} tipo={enlace} negocio={yo.negocio.nombre} />}
                    {acciones.includes('desactivar') && (
                      <BotonDeAccion
                        etiqueta="Desactivar"
                        enviando="Desactivando…"
                        icono="quitarUsuario"
                        variante="peligro"
                        accion={desactivarUsuario.bind(null, u.id)}
                        confirmar={{
                          pregunta: `¿Desactivar a ${u.nombre}?`,
                          detalle: 'Se cierra su sesión de inmediato y no podrá entrar. Para que vuelva, envíale una invitación nueva.',
                          boton: 'Sí, desactivar',
                        }}
                      />
                    )}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-suave">Los enlaces para entrar o cambiar la contraseña son solo para barberos. Si un dueño olvida la suya, la recupera con el soporte de Turnoo.</p>
    </div>
  );
}
