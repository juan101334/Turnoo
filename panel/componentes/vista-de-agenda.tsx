import { CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  bloqueosDe,
  desdeAhora,
  duracionLegible,
  duracionMinutos,
  huecosLibres,
  instanteDe,
  INTERVALO_POR_DEFECTO,
  marcasDelHueco,
  MINUTOS_DEL_DIA,
  minutosDesdeElInicio,
  ocupaLaAgenda,
  quienSigue,
  rangoDeLaGrilla,
  rangosDeTrabajo,
  resumenDelDia,
  sinTurno,
  tramoDe,
  type Tramo,
} from '@/lib/agenda';
import type { Bloqueo } from '@/lib/bloqueos';
import { accionesPosibles, ESTADOS, nombresDeServicios, pesos, type Cita } from '@/lib/citas';
import { barberos as leerBarberos, bloqueosEntre, citaSiExiste, citasDelDia, horariosDe, miNegocio, siSePuede, type Barbero } from '@/lib/datos';
import { diaRelativo, fechaLarga, horaLocal, hoyEn, limitesDelDia } from '@/lib/fechas';
import type { UsuarioDelNegocio } from '@/lib/sesion';
import { AccionPrincipal } from './accion-principal';
import { BarberosSinTurno } from './barberos-sin-turno';
import { BloqueSigue } from './bloque-sigue';
import { FiltroDeBarberos } from './filtro-de-barberos';
import { GrillaDelDia, type ColumnaDeBarbero } from './grilla-del-dia';
import { ListaDelDia, type ElementoDelDia } from './lista-del-dia';
import { ProveedorDeMarcado } from './acciones-con-deshacer';
import { PanelDeCita } from './panel-de-cita';
import { RefrescoAutomatico } from './refresco-automatico';
import { ResumenDelDia } from './resumen-del-dia';
import { SelectorDeFecha } from './selector-de-fecha';
import type { VistaDeCita } from './tarjeta-de-cita';
import { TiraDeDias } from './tira-de-dias';

interface Enlace {
  fecha?: string;
  barbero?: string | undefined;
  cita?: string | undefined;
}

/**
 * Agenda de un día. En el celular y la tablet, una lista (con "Sigue", huecos para agendar y
 * "Completada" en la tarjeta); desde 1024 px, una grilla por horas con una columna por barbero y
 * el detalle de la cita al lado (?cita=id). `ruta` es la página que la muestra (/hoy o /agenda).
 */
export async function VistaDeAgenda({
  usuario,
  fecha,
  conTira,
  ruta,
  barbero,
  citaAbierta,
  arriba,
}: {
  usuario: UsuarioDelNegocio;
  fecha: string;
  conTira: boolean;
  ruta: '/hoy' | '/agenda';
  /** ?barbero= tal como llegó; se ignora si no es un barbero activo del negocio. */
  barbero?: string | undefined;
  /** ?cita= tal como llegó: abre el panel lateral en el escritorio. */
  citaAbierta?: string | undefined;
  /** Algo propio de la pantalla bajo el encabezado (en Hoy, los primeros pasos del dueño). */
  arriba?: ReactNode;
}) {
  const zona = usuario.negocio.zonaHoraria;
  const ahora = new Date();
  const hoy = hoyEn(zona, ahora);
  const esDueno = usuario.rol === 'dueno';
  // Al barbero, el backend le devuelve solo el suyo.
  const equipo = (await leerBarberos()).filter((b) => b.activo);
  const conFiltro = esDueno && equipo.length > 1;
  const elegido = conFiltro ? equipo.find((b) => b.id === barbero) : undefined;
  const columnas: Barbero[] = elegido ? [elegido] : equipo;
  const unSoloBarbero = columnas.length === 1;

  const { desde, hasta } = limitesDelDia(fecha, zona);
  const [citas, bloqueos, horarios, abierta, intervalo] = await Promise.all([
    citasDelDia(fecha, zona, { profesionalId: elegido?.id }),
    siSePuede(() => bloqueosEntre(desde, hasta)).then((b) => b ?? []),
    Promise.all(columnas.map((b) => siSePuede(() => horariosDe(b.id)).then((h) => h ?? []))),
    citaAbierta ? citaSiExiste(citaAbierta) : Promise.resolve(undefined),
    // El dueño ya lo leyó para el marco (cache): no es otra llamada. El barbero no lo puede leer.
    esDueno ? siSePuede(miNegocio).then((n) => n?.configuracion.intervaloMinutos ?? INTERVALO_POR_DEFECTO) : INTERVALO_POR_DEFECTO,
  ]);
  const ordenadas = [...citas].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const relativo = diaRelativo(fecha, hoy);
  const esHoy = fecha === hoy;
  // Desde qué minuto se ofrecen huecos: hoy, desde ahora; un día pasado, ninguno.
  const libreDesde = esHoy ? desdeAhora(fecha, zona, ahora) : fecha < hoy ? MINUTOS_DEL_DIA : 0;

  const enlace = (cambios: Enlace) => {
    const q = new URLSearchParams();
    const f = 'fecha' in cambios ? cambios.fecha : ruta === '/agenda' ? fecha : undefined;
    if (f) q.set('fecha', f);
    const b = 'barbero' in cambios ? cambios.barbero : elegido?.id;
    if (b) q.set('barbero', b);
    if (cambios.cita) q.set('cita', cambios.cita);
    const texto = q.toString();
    return texto ? `${ruta}?${texto}` : ruta;
  };
  const enlaceAgenda = (f: string) => {
    const q = new URLSearchParams({ fecha: f, ...(elegido && { barbero: elegido.id }) });
    return `/agenda?${q}`;
  };
  /** Nueva cita con el día y el barbero; desde un hueco, también la hora (Nueva cita la deja marcada). */
  const nuevaCita = (barberoId?: string, desde?: number) => {
    const b = barberoId ?? elegido?.id;
    const q = new URLSearchParams({ fecha: fecha < hoy ? hoy : fecha, ...(b && { barbero: b }) });
    if (desde !== undefined) q.set('hora', instanteDe(fecha, desde, zona));
    return `/citas/nueva?${q}`;
  };

  const hora = (minutos: number) => horaLocal(instanteDe(fecha, minutos, zona), zona);
  const horas = (t: Tramo) => (t.inicio === 0 && t.fin === MINUTOS_DEL_DIA ? 'Todo el día' : `${hora(t.inicio)} – ${hora(t.fin)}`);
  const nombreDe = new Map(equipo.map((b) => [b.id, b.nombre]));
  const motivo = (b: Bloqueo) => b.motivo ?? 'Sin motivo';

  // --- Lista (celular y tablet) ---
  const vista = (c: Cita): VistaDeCita => ({
    id: c.id,
    hora: horaLocal(c.inicio, zona),
    cliente: c.clienteNombre ?? 'Cliente sin nombre',
    detalle: `${nombresDeServicios(c.servicios)}${esDueno && !unSoloBarbero ? ` · ${c.profesionalNombre}` : ''}`,
    resumen: `hasta ${horaLocal(c.fin, zona)} · ${duracionLegible(duracionMinutos(c))} · ${pesos(c.precioTotalCop)}`,
    estado: c.estado,
    puedeCompletar: (c.estado === 'pendiente' || c.estado === 'confirmada') && accionesPosibles(c, ahora).includes('completar'),
  });
  const conMinuto: { minuto: number; elemento: ElementoDelDia }[] = ordenadas.map((c) => ({
    minuto: minutosDesdeElInicio(c.inicio, fecha, zona),
    elemento: { tipo: 'cita', clave: c.id, cita: vista(c) },
  }));
  const bloqueosDeLaLista = unSoloBarbero ? bloqueosDe(bloqueos, columnas[0]!.id) : bloqueos;
  for (const b of bloqueosDeLaLista) {
    const t = tramoDe(b, fecha, zona);
    if (!t) continue;
    const quien = unSoloBarbero ? undefined : b.profesionalId ? (nombreDe.get(b.profesionalId) ?? 'Otro barbero') : 'Todo el negocio';
    conMinuto.push({ minuto: t.inicio, elemento: { tipo: 'bloqueo', clave: `b${b.id}`, horas: horas(t), motivo: motivo(b), ...(quien && { quien }) } });
  }
  if (unSoloBarbero) {
    const b = columnas[0]!;
    const huecos = huecosLibres({
      trabajo: rangosDeTrabajo(horarios[0] ?? [], fecha),
      citas,
      bloqueos: bloqueosDe(bloqueos, b.id),
      fecha,
      zona,
      desde: libreDesde,
    });
    for (const h of huecos) {
      conMinuto.push({
        minuto: h.inicio,
        elemento: { tipo: 'hueco', clave: `h${h.inicio}`, horas: horas(h), href: nuevaCita(b.id, h.inicio), etiqueta: `Agendar, libre de ${horas(h)}` },
      });
    }
  }
  const minutoAhora = esHoy ? minutosDesdeElInicio(ahora, fecha, zona) : undefined;
  if (minutoAhora !== undefined) {
    conMinuto.push({ minuto: minutoAhora + 0.5, elemento: { tipo: 'ahora', clave: 'ahora', hora: horaLocal(ahora, zona) } });
  }
  const elementos = conMinuto.sort((a, b) => a.minuto - b.minuto).map((e) => e.elemento);
  const sigue = esHoy ? quienSigue(ordenadas, ahora) : null;
  const sinCitas = `${relativo === 'Hoy' ? 'No hay citas para hoy' : 'No hay citas este día'}${elegido ? ` con ${elegido.nombre}` : ''}.`;

  // --- Grilla (escritorio) ---
  const columnasDeLaGrilla = columnas.map((b, i) => {
    const propias = citas.filter((c) => c.profesionalId === b.id);
    return { barbero: b, trabajo: rangosDeTrabajo(horarios[i] ?? [], fecha), citas: propias, bloqueos: bloqueosDe(bloqueos, b.id) };
  });
  const rango = rangoDeLaGrilla([
    ...columnasDeLaGrilla.flatMap((c) => c.trabajo),
    ...citas.filter((c) => ocupaLaAgenda(c.estado)).flatMap((c) => tramoDe(c, fecha, zona) ?? []),
  ]);
  const dentro = (t: Tramo | null): Tramo | null => {
    if (!t) return null;
    const a = Math.max(t.inicio, rango.inicio);
    const b = Math.min(t.fin, rango.fin);
    return b > a ? { inicio: a, fin: b } : null;
  };
  // Con un solo barbero a la vista no se esconde nada: si no trabaja, la grilla vacía lo dice.
  const conSinTurno = columnasDeLaGrilla.length > 1;
  const grilla: ColumnaDeBarbero[] = columnasDeLaGrilla.map((c) => ({
    id: c.barbero.id,
    nombre: c.barbero.nombre,
    trabajo: c.trabajo,
    sinTurno: conSinTurno && sinTurno({ trabajo: c.trabajo, citas: c.citas.filter((x) => ocupaLaAgenda(x.estado)) }),
    citas: c.citas
      .filter((x) => ocupaLaAgenda(x.estado))
      .flatMap((x) => {
        const t = dentro(tramoDe(x, fecha, zona));
        if (!t) return [];
        const cliente = x.clienteNombre ?? 'Cliente sin nombre';
        const servicios = nombresDeServicios(x.servicios);
        return [
          {
            id: x.id,
            tramo: t,
            hora: horaLocal(x.inicio, zona),
            cliente,
            servicios,
            estado: x.estado,
            href: enlace({ cita: x.id }),
            etiqueta: `${horaLocal(x.inicio, zona)}, ${cliente}, ${servicios}, ${ESTADOS[x.estado].etiqueta}`,
          },
        ];
      }),
    bloqueos: c.bloqueos.flatMap((b) => {
      const t = dentro(tramoDe(b, fecha, zona));
      return t ? [{ clave: b.id, tramo: t, motivo: motivo(b) }] : [];
    }),
    huecos: huecosLibres({ trabajo: c.trabajo, citas: c.citas, bloqueos: c.bloqueos, fecha, zona, desde: libreDesde }).map((h) => ({
      clave: `h${h.inicio}`,
      tramo: h,
      marcas: marcasDelHueco(h, intervalo).map((m) => ({ minuto: m, hora: hora(m), href: nuevaCita(c.barbero.id, m) })),
      etiqueta: `Agendar con ${c.barbero.nombre}, libre de ${horas(h)}`,
    })),
  }));
  const etiquetasDeHora = Array.from({ length: (rango.fin - rango.inicio) / 60 + 1 }, (_, i) => rango.inicio + i * 60)
    .filter((m) => m < rango.fin)
    .map((m) => ({ minuto: m, texto: hora(m).replace(':00', '') }));
  const canceladas = ordenadas.filter((c) => c.estado === 'cancelada');
  const conPanel = abierta !== undefined;
  const sinTurnoHoy = grilla.filter((c) => c.sinTurno).map((c) => c.nombre);
  const resumen = resumenDelDia(citas);
  const laGrilla = (
    <GrillaDelDia
      columnas={grilla}
      rango={rango}
      horas={etiquetasDeHora}
      ahora={minutoAhora !== undefined ? { minuto: minutoAhora, texto: horaLocal(ahora, zona) } : undefined}
      seleccionada={abierta?.id}
    />
  );

  return (
    <div className="ancho-completo">
      <RefrescoAutomatico />
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-suave">{usuario.negocio.nombre}</p>
          <h1 className="text-2xl font-semibold">{relativo ?? 'Agenda'}</h1>
          {conTira ? (
            <SelectorDeFecha fecha={fecha} texto={fechaLarga(fecha)} enlace={enlaceAgenda('__FECHA__')} />
          ) : (
            <p className="text-sm text-suave first-letter:uppercase">{fechaLarga(fecha)}</p>
          )}
        </div>
        <AccionPrincipal href={nuevaCita()} etiqueta="Nueva cita" Icono={CalendarPlus} />
      </div>

      {arriba}
      {conFiltro && (
        <div className="mb-3">
          <FiltroDeBarberos barberos={equipo} elegido={elegido?.id} enlace={(b) => enlace({ barbero: b })} />
        </div>
      )}
      {conTira && (
        <div className="mb-4">
          {/* Seis semanas: en el PC se pasan con los botones de semana o la rueda; más lejos, el calendario. */}
          <TiraDeDias seleccionada={fecha} hoy={hoy} dias={42} semanas enlace={(f) => enlace({ fecha: f })} />
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {citas.length === 1 ? '1 cita' : `${citas.length} citas`}
        {elegido && ` de ${elegido.nombre}`}
      </p>

      <div className="lg:hidden">
        {sigue && (
          <BloqueSigue cita={sigue.cita} enCurso={sigue.enCurso} zona={zona} conBarbero={esDueno && !unSoloBarbero} ahora={ahora} href={`/citas/${sigue.cita.id}`} />
        )}
        {citas.length === 0 && elementos.some((e) => e.tipo === 'hueco') && <p className="mb-2 text-sm text-suave">{sinCitas}</p>}
        <ProveedorDeMarcado>
          <ListaDelDia elementos={elementos} vacia={<p>{sinCitas}</p>} />
        </ProveedorDeMarcado>
      </div>

      {/* En el escritorio, lo de ahora y el día en números, arriba de la grilla. */}
      <div className="mb-4 hidden items-stretch gap-4 lg:flex">
        {sigue && (
          <BloqueSigue
            cita={sigue.cita}
            enCurso={sigue.enCurso}
            zona={zona}
            conBarbero={esDueno && !unSoloBarbero}
            ahora={ahora}
            href={enlace({ cita: sigue.cita.id })}
            className="min-w-0 flex-1"
            id="sigue-escritorio"
          />
        )}
        <ResumenDelDia {...resumen} enlacePorAprobar={esDueno ? '/por-aprobar' : undefined} />
      </div>

      <div className="hidden gap-6 lg:flex">
        <div className="min-w-0 flex-1">
          {grilla.length === 0 ? (
            <div className="rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">No hay barberos activos.</div>
          ) : (
            <>
              {citas.length === 0 && <p className="mb-2 text-sm text-suave">{sinCitas}</p>}
              {sinTurnoHoy.length > 0 ? (
                <BarberosSinTurno nombres={sinTurnoHoy} columnas={grilla.length}>
                  {laGrilla}
                </BarberosSinTurno>
              ) : (
                laGrilla
              )}
            </>
          )}
          {canceladas.length > 0 && (
            <div className="mt-3 text-sm text-suave">
              <p className="mb-1 font-medium">Canceladas</p>
              <ul className="flex flex-wrap gap-2">
                {canceladas.map((c) => (
                  <li key={c.id}>
                    <Link href={enlace({ cita: c.id })} scroll={false} className="inline-flex min-h-11 items-center rounded-lg border border-borde bg-superficie px-3 line-through hover:bg-fondo">
                      {horaLocal(c.inicio, zona)} · {c.clienteNombre ?? 'Cliente sin nombre'}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {conPanel && <PanelDeCita cita={abierta} zona={zona} cerrar={enlace({})} />}
      </div>
    </div>
  );
}
