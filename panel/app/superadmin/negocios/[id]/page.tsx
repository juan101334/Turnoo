import { ChevronDown, ChevronLeft, Ellipsis, MessageCircle, UserPlus, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AvisoDeLaUrl } from '@/componentes/aviso-de-la-url';
import { BotonDeAccion } from '@/componentes/boton-de-accion';
import { Campo, CampoContrasena } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { accionesDelSuperadmin } from '@/lib/administracion';
import { telefonoLegible } from '@/lib/citas';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import type { EstadoNegocio } from '@/lib/plan';
import { cuentasWhatsapp, negocio as leerNegocio, usuariosDe } from '@/lib/superadmin';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import {
  cambiarEstado,
  cambiarTokenWhatsapp,
  cambiarWhatsappActiva,
  desactivarUsuarioDelNegocio,
  registrarWhatsapp,
} from '../../acciones';
import { EstadoDeNegocio } from '../../estado-de-negocio';
import { EnlaceDeUsuario } from './enlace-de-usuario';
import { InvitarDueno } from './invitar-dueno';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigirSuperadmin();
  return { title: `${(await leerNegocio((await params).id)).nombre} · Superadmin` };
}

const LISTO: Record<string, string> = { creado: 'Negocio creado, en prueba. Ahora conecta su WhatsApp e invita al dueño.' };

const ESTADOS_USUARIO = {
  activo: { etiqueta: 'Activo', clases: 'bg-exito-suave text-exito' },
  pendiente: { etiqueta: 'Invitación pendiente', clases: 'bg-aviso-suave text-aviso' },
  desactivado: { etiqueta: 'Desactivado', clases: 'bg-fondo text-suave ring-1 ring-borde' },
} as const;

/** Lo que significa cada estado, para elegir con conocimiento. */
const CAMBIOS_DE_ESTADO: { estado: EstadoNegocio; boton: string; detalle: string }[] = [
  { estado: 'activo', boton: 'Activar', detalle: 'Funciona sin límite de prueba.' },
  { estado: 'prueba', boton: 'Poner en prueba', detalle: 'Funciona hasta la fecha de fin de la prueba.' },
  { estado: 'suspendido', boton: 'Suspender', detalle: 'Entran y consultan, pero no pueden cambiar nada y el asistente no agenda.' },
];

function Seccion({ id, titulo, icono, ayuda, children }: { id: string; titulo: string; icono?: ReactNode; ayuda?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-borde bg-superficie p-4 lg:p-6">
      <h2 id={id} className="flex items-center gap-2 font-semibold">
        {icono}
        {titulo}
      </h2>
      {ayuda && <p className="text-sm text-suave">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Ficha de un negocio para el superadmin: datos y estado, números de WhatsApp conectados y
 * usuarios (invitar al dueño, darle un enlace de contraseña nueva, desactivar). Sin planes, uso
 * ni pagos: el cobro todavía no está diseñado.
 */
export default async function PaginaNegocioSuperadmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listo?: string }> }) {
  await exigirSuperadmin();
  const { id } = await params;
  const { listo } = await searchParams;
  const [n, cuentas, usuarios] = await Promise.all([leerNegocio(id), cuentasWhatsapp(id), usuariosDe(id)]);
  const zona = n.zonaHoraria;
  const fecha = (iso: string) => fechaLarga(fechaDe(iso, zona));
  const hayDueno = usuarios.some((u) => u.rol === 'dueno' && u.estado !== 'desactivado');

  return (
    <div>
      <Link href="/superadmin" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Negocios
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold break-words">{n.nombre}</h1>
        <EstadoDeNegocio estado={n.estado} />
      </div>
      <p className="mb-4 text-sm text-suave">
        Desde el {fecha(n.createdAt)}
        {n.estado === 'prueba' && n.pruebaHasta && ` · prueba hasta el ${fecha(n.pruebaHasta)}`} · {zona.replaceAll('_', ' ')}
        {n.telefonoAvisos && ` · avisos a ${telefonoLegible(n.telefonoAvisos)}`}
      </p>
      <AvisoDeLaUrl mensaje={listo ? LISTO[listo] : undefined} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Seccion id="estado" titulo="Estado" ayuda={CAMBIOS_DE_ESTADO.find((c) => c.estado === n.estado)?.detalle}>
            <div className="flex flex-col gap-2">
              {CAMBIOS_DE_ESTADO.filter((c) => c.estado !== n.estado).map((c) => (
                <BotonDeAccion
                  key={c.estado}
                  etiqueta={c.boton}
                  enviando="Guardando…"
                  variante={c.estado === 'suspendido' ? 'peligro' : 'secundario'}
                  accion={cambiarEstado.bind(null, n.id, c.estado)}
                  {...(c.estado === 'suspendido' && {
                    confirmar: { pregunta: `¿Suspender ${n.nombre}?`, detalle: c.detalle, boton: 'Sí, suspender' },
                  })}
                />
              ))}
            </div>
          </Seccion>

          <Seccion
            id="whatsapp"
            titulo="WhatsApp"
            icono={<MessageCircle aria-hidden className="size-5 text-marca" />}
            ayuda="El número con el que el asistente atiende. Los datos salen del panel de WhatsApp de Meta."
          >
            {cuentas.length === 0 ? (
              <p className="mb-4 text-sm text-aviso">Sin número conectado: el asistente no recibe mensajes de este negocio.</p>
            ) : (
              <ul className="mb-4 divide-y divide-borde rounded-xl border border-borde">
                {cuentas.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium tabular-nums">{telefonoLegible(c.numeroVisible)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.activa ? 'bg-exito-suave text-exito' : 'bg-fondo text-suave ring-1 ring-borde'}`}>
                        {c.activa ? 'Activo' : 'Desactivado'}
                      </span>
                    </div>
                    <p className="text-xs break-all text-suave tabular-nums">
                      Phone number ID {c.phoneNumberId} · WABA {c.wabaId}
                    </p>
                    <BotonDeAccion
                      etiqueta={c.activa ? 'Desactivar número' : 'Activar número'}
                      enviando="Guardando…"
                      variante={c.activa ? 'peligro' : 'secundario'}
                      accion={cambiarWhatsappActiva.bind(null, n.id, c.id, !c.activa)}
                      {...(c.activa && {
                        confirmar: { pregunta: '¿Desactivar este número?', detalle: 'El asistente deja de responder los mensajes que lleguen a él.', boton: 'Sí, desactivar' },
                      })}
                    />
                    <details className="group">
                      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave [&::-webkit-details-marker]:hidden">
                        Cambiar token
                        <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" />
                      </summary>
                      <div className="mt-2">
                        <FormularioConEstado limpiar accion={cambiarTokenWhatsapp.bind(null, n.id, c.id)} boton="Guardar token nuevo" enviando="Guardando…" variante="secundario">
                          <CampoContrasena id={`token-${c.id}`} name="token" etiqueta="Token nuevo" autoComplete="off" required ayuda="Se guarda cifrado y nunca se vuelve a mostrar." />
                        </FormularioConEstado>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {/* Con un número ya conectado, el formulario para otro queda plegado. */}
            <details open={cuentas.length === 0} className="group">
              <summary className="mb-2 flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-semibold hover:text-marca [&::-webkit-details-marker]:hidden">
                {cuentas.length === 0 ? 'Conectar un número' : 'Conectar otro número'}
                <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" />
              </summary>
              <FormularioConEstado limpiar accion={registrarWhatsapp.bind(null, n.id)} boton="Conectar número" enviando="Conectando…" variante={cuentas.length === 0 ? 'primario' : 'secundario'}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo id="phoneNumberId" name="phoneNumberId" etiqueta="Phone number ID" required inputMode="numeric" maxLength={30} autoComplete="off" />
                  <Campo id="wabaId" name="wabaId" etiqueta="WABA ID" required inputMode="numeric" maxLength={30} autoComplete="off" />
                </div>
                <Campo id="numeroVisible" name="numeroVisible" etiqueta="Número que ven los clientes" type="tel" inputMode="tel" required maxLength={30} autoComplete="off" />
                <CampoContrasena id="token" name="token" etiqueta="Token de acceso" required autoComplete="off" ayuda="Se guarda cifrado y nunca se vuelve a mostrar." />
              </FormularioConEstado>
            </details>
          </Seccion>
        </div>

        <Seccion id="usuarios" titulo="Usuarios" icono={<UsersRound aria-hidden className="size-5 text-marca" />} ayuda="Quién entra al panel de este negocio.">
          {usuarios.length === 0 ? (
            <p className="mb-4 text-sm text-aviso">Nadie entra todavía. Invita al dueño.</p>
          ) : (
            <ul aria-label="Usuarios del negocio" className="mb-4 flex flex-col gap-2">
              {usuarios.map((u) => {
                const estado = ESTADOS_USUARIO[u.estado];
                const acciones = accionesDelSuperadmin(u);
                const enlace = acciones.find((a) => a !== 'desactivar');
                return (
                  <li key={u.id} className="rounded-xl border border-borde p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{u.nombre}</p>
                        <p className="text-sm break-all text-suave">{u.email}</p>
                        <p className="text-sm text-suave">
                          {u.rol === 'dueno' ? 'Dueño' : 'Barbero'}
                          {u.ultimoLoginEn && ` · entró el ${fecha(u.ultimoLoginEn)}`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${estado.clases}`}>{estado.etiqueta}</span>
                    </div>
                    <details className="group mt-2">
                      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-marca hover:bg-marca-suave [&::-webkit-details-marker]:hidden">
                        <Ellipsis aria-hidden className="size-4" />
                        Acciones
                        <ChevronDown aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-180" />
                      </summary>
                      <div className="mt-2 flex flex-col gap-2 border-t border-borde pt-3">
                        {enlace && <EnlaceDeUsuario negocioId={n.id} usuarioId={u.id} tipo={enlace} negocio={n.nombre} />}
                        {acciones.includes('desactivar') && (
                          <BotonDeAccion
                            etiqueta="Desactivar"
                            enviando="Desactivando…"
                            icono="quitarUsuario"
                            variante="peligro"
                            accion={desactivarUsuarioDelNegocio.bind(null, n.id, u.id)}
                            confirmar={{ pregunta: `¿Desactivar a ${u.nombre}?`, detalle: 'Se cierra su sesión y no podrá entrar hasta una invitación nueva.', boton: 'Sí, desactivar' }}
                          />
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <UserPlus aria-hidden className="size-4" />
            {hayDueno ? 'Invitar a otro dueño' : 'Invitar al dueño'}
          </h3>
          <InvitarDueno negocioId={n.id} negocio={n.nombre} />
          <p className="mt-3 text-xs text-suave">Los barberos los invita el dueño desde su panel.</p>
        </Seccion>
      </div>
    </div>
  );
}
