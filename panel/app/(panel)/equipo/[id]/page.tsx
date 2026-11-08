import { ChevronLeft, Pencil, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Aviso } from '@/componentes/aviso';
import { BotonDeAccion } from '@/componentes/boton-de-accion';
import { Campo, CampoSeleccion } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { DIAS_SEMANA, horariosPorDia } from '@/lib/administracion';
import { pesos } from '@/lib/citas';
import { barbero as leerBarbero, horariosDe, serviciosDe, usuarios as leerUsuarios } from '@/lib/datos';
import { exigirUsuario } from '@/lib/sesion';
import { asignarUsuario, cambiarBarberoActivo, cambiarServicioActivo, crearHorario, crearServicio, renombrarBarbero } from '../acciones';
import { HorarioSemanal } from './horario-semanal';

export const metadata: Metadata = { title: 'Barbero' };

const LISTO: Record<string, string> = {
  creado: 'Barbero agregado. Ahora agrégale servicios y su horario para que pueda recibir citas.',
  servicio: 'Servicio guardado.',
};

function Seccion({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-4 rounded-2xl border border-borde bg-superficie p-4">
      <h2 id={id} className="font-semibold">
        {titulo}
      </h2>
      {ayuda && <p className="text-sm text-suave">{ayuda}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Todo lo de un barbero: servicios y precios, horario semanal, acceso al panel, nombre y estado. */
export default async function PaginaBarbero({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listo?: string }> }) {
  await exigirUsuario('equipo');
  const { id } = await params;
  const { listo } = await searchParams;
  const b = await leerBarbero(id);
  const [servicios, horarios, usuarios] = await Promise.all([serviciosDe(b.id), horariosDe(b.id), leerUsuarios()]);
  const mensaje = listo ? LISTO[listo] : undefined;
  // Se puede asignar a quien no está desactivado y no atiende ya con otro barbero.
  const asignables = usuarios.filter((u) => u.estado !== 'desactivado' && (u.profesionalId === null || u.profesionalId === b.id));

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/equipo" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Barberos y servicios
      </Link>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold break-words">{b.nombre}</h1>
        {!b.activo && <p className="text-sm text-suave">Inactivo: no aparece para agendar.</p>}
      </div>
      {mensaje && (
        <div className="mb-4">
          <Aviso tipo="exito">{mensaje}</Aviso>
        </div>
      )}

      <Seccion id="servicios" titulo="Servicios y precios" ayuda="Lo que el asistente y el panel ofrecen con este barbero.">
        {servicios.length === 0 ? (
          <p className="mb-4 text-sm text-suave">Sin servicios todavía.</p>
        ) : (
          <ul className="mb-4 divide-y divide-borde rounded-xl border border-borde">
            {servicios.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium break-words ${s.activo ? '' : 'text-suave line-through'}`}>{s.nombre}</p>
                    <p className="text-sm text-suave tabular-nums">
                      {s.duracionMinutos} min · {pesos(s.precioCop)}
                      {!s.activo && ' · no se ofrece'}
                    </p>
                  </div>
                  <Link
                    href={`/equipo/${b.id}/servicios/${s.id}`}
                    aria-label={`Editar ${s.nombre}`}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-sm font-medium hover:bg-fondo"
                  >
                    <Pencil aria-hidden className="size-4" />
                    Editar
                  </Link>
                </div>
                <BotonDeAccion
                  etiqueta={s.activo ? 'Dejar de ofrecer' : 'Volver a ofrecer'}
                  enviando="Guardando…"
                  accion={cambiarServicioActivo.bind(null, b.id, s.id, !s.activo)}
                />
              </li>
            ))}
          </ul>
        )}
        <h3 className="mb-2 text-sm font-semibold">Agregar servicio</h3>
        <FormularioConEstado accion={crearServicio.bind(null, b.id)} boton="Agregar servicio" enviando="Agregando…" variante="secundario">
          <Campo id="servicio-nombre" name="nombre" etiqueta="Nombre" required maxLength={100} autoComplete="off" placeholder="Corte" />
          <div className="grid grid-cols-2 gap-3">
            <Campo id="servicio-duracion" name="duracion" etiqueta="Duración (min)" required inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="30" />
            <Campo id="servicio-precio" name="precio" etiqueta="Precio ($)" required inputMode="numeric" maxLength={13} placeholder="25.000" />
          </div>
        </FormularioConEstado>
      </Seccion>

      <Seccion id="horario" titulo="Horario semanal" ayuda="Para el almuerzo, usa dos rangos el mismo día: de 8:00 a. m. a 12:00 p. m. y de 2:00 p. m. a 8:00 p. m. Los días sueltos se cierran con un bloqueo.">
        <HorarioSemanal barberoId={b.id} dias={horariosPorDia(horarios)} />
        <h3 className="mt-4 mb-2 text-sm font-semibold">Agregar horario</h3>
        <FormularioConEstado accion={crearHorario.bind(null, b.id)} boton="Agregar horario" enviando="Agregando…" variante="secundario">
          <CampoSeleccion id="horario-dia" name="dia" etiqueta="Día" defaultValue="1">
            {DIAS_SEMANA.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </CampoSeleccion>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="horario-desde" name="desde" etiqueta="Desde" type="time" required step={300} />
            <Campo id="horario-hasta" name="hasta" etiqueta="Hasta" type="time" required step={300} />
          </div>
        </FormularioConEstado>
      </Seccion>

      <Seccion id="acceso" titulo="Acceso al panel" ayuda="Quién entra al panel como este barbero: ve su agenda y sus clientes.">
        <FormularioConEstado accion={asignarUsuario.bind(null, b.id)} boton="Guardar acceso" enviando="Guardando…" variante="secundario">
          <CampoSeleccion id="usuario" name="usuarioId" etiqueta="Usuario" defaultValue={b.usuarioId ?? ''}>
            <option value="">Nadie (sin acceso)</option>
            {asignables.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.rol === 'dueno' ? 'dueño' : 'barbero'}
                {u.estado === 'pendiente' ? ', invitación pendiente' : ''})
              </option>
            ))}
          </CampoSeleccion>
        </FormularioConEstado>
        {!b.usuarioId && b.activo && (
          <Link
            href={`/usuarios/invitar?barbero=${b.id}`}
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-borde text-sm font-semibold hover:bg-fondo"
          >
            <UserPlus aria-hidden className="size-4" />
            Invitar a alguien como este barbero
          </Link>
        )}
      </Seccion>

      <Seccion id="nombre" titulo="Nombre">
        <FormularioConEstado accion={renombrarBarbero.bind(null, b.id)} boton="Guardar nombre" enviando="Guardando…" variante="secundario">
          <Campo id="barbero-nombre" name="nombre" etiqueta="Nombre del barbero" required maxLength={100} defaultValue={b.nombre} autoComplete="off" />
        </FormularioConEstado>
      </Seccion>

      <Seccion
        id="estado"
        titulo={b.activo ? 'Desactivar' : 'Activar'}
        ayuda={b.activo ? 'Deja de aparecer para agendar; su historial se conserva. Si tiene citas futuras, primero cancélalas o pásalas a otro barbero.' : 'Vuelve a aparecer para agendar con su horario y servicios.'}
      >
        {b.activo ? (
          <BotonDeAccion
            etiqueta="Desactivar barbero"
            enviando="Desactivando…"
            icono="apagar"
            variante="peligro"
            accion={cambiarBarberoActivo.bind(null, b.id, false)}
            confirmar={{ pregunta: `¿Desactivar a ${b.nombre}?`, detalle: 'No podrá recibir citas nuevas hasta que lo actives otra vez.', boton: 'Sí, desactivar' }}
          />
        ) : (
          <BotonDeAccion etiqueta="Activar barbero" enviando="Activando…" icono="encender" variante="primario" accion={cambiarBarberoActivo.bind(null, b.id, true)} />
        )}
      </Seccion>
    </div>
  );
}
