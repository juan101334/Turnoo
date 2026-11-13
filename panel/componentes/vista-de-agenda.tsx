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
import { accionesPosibles, nombresDeServicios, pesos, type Cita } from '@/lib/citas';
import {
  barberos as leerBarberos,
  bloqueosEntre,
  citaSiExiste,
  citasDelDia,
  citasEntre,
  citasPorDia,
  horariosDe,
  miNegocio,
  siSePuede,
  type Barbero,
} from '@/lib/datos';
import { diaRelativo, diasDeLaSemana, diasDeLaTira, fechaLarga, horaLocal, hoyEn, limitesDelDia, partesDelDia, rangoDeFechas } from '@/lib/fechas';
import type { UsuarioDelNegocio } from '@/lib/sesion';
import { AccionPrincipal } from './accion-principal';
import { BarberosSinTurno } from './barberos-sin-turno';
import { BloqueSigue } from './bloque-sigue';
import { CompletarPasadas, type CitaPasada } from './completar-pasadas';
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
import { SelectorDeVista } from './selector-de-vista';

interface Enlace {
  fecha?: string;
  barbero?: string | undefined;
  cita?: string | undefined;
  vista?: Vista;
}

export type Vista = 'dia' | 'semana';

/** Días de la tira de la agenda: seis semanas (el conteo de los puntos admite hasta 62). */
const DIAS_DE_LA_TIRA = 42;

/**
 * Agenda de un día. En el celular y la tablet, una lista (con "Sigue", huecos para agendar y
 * "Completada" en la tarjeta); desde 1024 px, una grilla por horas con una columna por barbero y
 * el detalle de la cita al lado (?cita=id). `ruta` es la página que la muestra (/hoy o /agenda).
 *
 * En /agenda, desde 1024 px, ?vista=semana muestra la semana (lunes a domingo) de UN barbero, con
 * una columna por día. Con "Todos" pide elegir uno: siete días por todo el equipo no caben y la
 * lista del backend tiene un tope de 500 citas. Abajo de 1024 px se ve el día, como siempre.
 */
export async function VistaDeAgenda({
  usuario,
  fecha,
  conTira,
  ruta,
  barbero,
  citaAbierta,
  arriba,
  vista = 'dia',
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
  /** ?vista= de /agenda; en Hoy siempre es el día. */
  vista?: Vista;
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
  const enSemana = ruta === '/agenda' && vista === 'semana';
  // La semana es de un barbero: el elegido, el del barbero que entró o el único del negocio.
  const barberoDeLaSemana = enSemana && unSoloBarbero ? columnas[0] : undefined;
  const semana = diasDeLaSemana(fecha);
  const diasTira = diasDeLaTira(fecha, hoy, DIAS_DE_LA_TIRA);

  const { desde, hasta } = limitesDelDia(fecha, zona);
  const [citas, bloqueos, horarios, abierta, intervalo, deLaSemana, puntos] = await Promise.all([
    citasDelDia(fecha, zona, { profesionalId: elegido?.id }),
    siSePuede(() => bloqueosEntre(desde, hasta)).then((b) => b ?? []),
    Promise.all(columnas.map((b) => siSePuede(() => horariosDe(b.id)).then((h) => h ?? []))),
    citaAbierta ? citaSiExiste(citaAbierta) : Promise.resolve(undefined),
    // El dueño ya lo leyó para el marco (cache): no es otra llamada. El barbero no lo puede leer.
    esDueno ? siSePuede(miNegocio).then((n) => n?.configuracion.intervaloMinutos ?? INTERVALO_POR_DEFECTO) : INTERVALO_POR_DEFECTO,
    // La semana entera de un barbero en una consulta (7 días de una persona: lejos del tope de 500).
    barberoDeLaSemana
      ? Promise.all([
          citasEntre(limitesDelDia(semana[0]!, zona).desde, limitesDelDia(semana[6]!, zona).hasta, { profesionalId: barberoDeLaSemana.id }),
          siSePuede(() => bloqueosEntre(limitesDelDia(semana[0]!, zona).desde, limitesDelDia(semana[6]!, zona).hasta)).then((b) => b ?? []),
        ])
      : Promise.resolve(undefined),
    // Los puntos de la tira: una consulta para las seis semanas. Si falla, la tira va sin puntos.
    conTira ? siSePuede(() => citasPorDia(diasTira[0]!, diasTira.at(-1)!, elegido?.id)) : Promise.resolve(undefined),
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
    const v = 'vista' in cambios ? cambios.vista : vista;
    if (ruta === '/agenda' && v === 'semana') q.set('vista', 'semana');
    if (cambios.cita) q.set('cita', cambios.cita);
    const texto = q.toString();
    return texto ? `${ruta}?${texto}` : ruta;
  };
  const enlaceAgenda = (f: string) => {
    const q = new URLSearchParams({ fecha: f, ...(elegido && { barbero: elegido.id }), ...(enSemana && { vista: 'semana' }) });
    return `/agenda?${q}`;
  };
  /** Nueva cita con el día y el barbero; desde un hueco, también la hora (Nueva cita la deja marcada). */
  const nuevaCita = (barberoId?: string, desde?: number, dia: string = fecha) => {
    const b = barberoId ?? elegido?.id;
    const q = new URLSearchParams({ fecha: dia < hoy ? hoy : dia, ...(b && { barbero: b }) });
    if (desde !== undefined) q.set('hora', instanteDe(dia, desde, zona));
    return `/citas/nueva?${q}`;
  };

  const horaEn = (dia: string, minutos: number) => horaLocal(instanteDe(dia, minutos, zona), zona);
  const hora = (minutos: number) => horaEn(fecha, minutos);
  const horasEn = (dia: string, t: Tramo) => (t.inicio === 0 && t.fin === MINUTOS_DEL_DIA ? 'Todo el día' : `${horaEn(dia, t.inicio)} – ${horaEn(dia, t.fin)}`);
  const horas = (t: Tramo) => horasEn(fecha, t);
  const nombreDe = new Map(equipo.map((b) => [b.id, b.nombre]));
  const motivo = (b: Bloqueo) => b.motivo ?? 'Sin motivo';

  /** Ya empezó y sigue sin marcar: "Completada" en la tarjeta y en la grilla. */
  const puedeCompletar = (c: Cita) => (c.estado === 'pendiente' || c.estado === 'confirmada') && accionesPosibles(c, ahora).includes('completar');
  // En Hoy, las que ya terminaron y nadie marcó: se pueden marcar todas de una vez.
  const pasadas: CitaPasada[] =
    ruta === '/hoy'
      ? ordenadas
          .filter((c) => puedeCompletar(c) && Date.parse(c.fin) <= ahora.getTime())
          .map((c) => ({
            id: c.id,
            hora: horaLocal(c.inicio, zona),
            cliente: c.clienteNombre ?? 'Cliente sin nombre',
            barbero: esDueno && !unSoloBarbero ? c.profesionalNombre : undefined,
          }))
      : [];

  // --- Lista (celular y tablet) ---
  const vistaDeCita = (c: Cita): VistaDeCita => ({
    id: c.id,
    hora: horaLocal(c.inicio, zona),
    cliente: c.clienteNombre ?? 'Cliente sin nombre',
    detalle: `${nombresDeServicios(c.servicios)}${esDueno && !unSoloBarbero ? ` · ${c.profesionalNombre}` : ''}`,
    resumen: `hasta ${horaLocal(c.fin, zona)} · ${duracionLegible(duracionMinutos(c))} · ${pesos(c.precioTotalCop)}`,
    estado: c.estado,
    puedeCompletar: puedeCompletar(c),
  });
  const conMinuto: { minuto: number; elemento: ElementoDelDia }[] = ordenadas.map((c) => ({
    minuto: minutosDesdeElInicio(c.inicio, fecha, zona),
    elemento: { tipo: 'cita', clave: c.id, cita: vistaDeCita(c) },
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
  const dentro = (t: Tramo | null, r: Tramo = rango): Tramo | null => {
    if (!t) return null;
    const a = Math.max(t.inicio, r.inicio);
    const b = Math.min(t.fin, r.fin);
    return b > a ? { inicio: a, fin: b } : null;
  };
  /** Una cita como bloque de la grilla (del día o de la semana). */
  const bloqueDe = (x: Cita, tramo: Tramo) => ({
    id: x.id,
    tramo,
    hora: horaLocal(x.inicio, zona),
    cliente: x.clienteNombre ?? 'Cliente sin nombre',
    servicios: nombresDeServicios(x.servicios),
    estado: x.estado,
    href: enlace({ cita: x.id }),
    puedeCompletar: puedeCompletar(x),
  });
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
        return t ? [bloqueDe(x, t)] : [];
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
  const etiquetasDe = (r: Tramo) =>
    Array.from({ length: (r.fin - r.inicio) / 60 + 1 }, (_, i) => r.inicio + i * 60)
      .filter((m) => m < r.fin)
      .map((m) => ({ minuto: m, texto: hora(m).replace(':00', '') }));
  const etiquetasDeHora = etiquetasDe(rango);
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

  // --- Semana (escritorio, un barbero) ---
  let laSemana: ReactNode = null;
  if (barberoDeLaSemana && deLaSemana) {
    const [citasSemana, bloqueosSemana] = deLaSemana;
    const b = barberoDeLaSemana;
    const trabajoDe = (d: string) => rangosDeTrabajo(horarios[0] ?? [], d);
    const bloqueosDelBarbero = bloqueosDe(bloqueosSemana, b.id);
    const activas = citasSemana.filter((c) => ocupaLaAgenda(c.estado));
    const rangoSemana = rangoDeLaGrilla([...semana.flatMap(trabajoDe), ...semana.flatMap((d) => activas.flatMap((c) => tramoDe(c, d, zona) ?? []))]);
    const libreDesdeEn = (d: string) => (d === hoy ? desdeAhora(d, zona, ahora) : d < hoy ? MINUTOS_DEL_DIA : 0);
    const dias: ColumnaDeBarbero[] = semana.map((d) => {
      const { semana: nombreDelDia, dia } = partesDelDia(d);
      return {
        id: d,
        nombre: `${nombreDelDia} ${dia}`,
        encabezado: { href: enlace({ fecha: d, vista: 'dia' }), actual: d === fecha, etiqueta: `${fechaLarga(d)}${d === hoy ? ', hoy' : ''}` },
        trabajo: trabajoDe(d),
        citas: activas.flatMap((x) => {
          const t = dentro(tramoDe(x, d, zona), rangoSemana);
          return t ? [bloqueDe(x, t)] : [];
        }),
        bloqueos: bloqueosDelBarbero.flatMap((bl) => {
          const t = dentro(tramoDe(bl, d, zona), rangoSemana);
          return t ? [{ clave: `${bl.id}-${d}`, tramo: t, motivo: motivo(bl) }] : [];
        }),
        huecos: huecosLibres({ trabajo: trabajoDe(d), citas: citasSemana, bloqueos: bloqueosDelBarbero, fecha: d, zona, desde: libreDesdeEn(d) }).map((h) => ({
          clave: `h${h.inicio}`,
          tramo: h,
          marcas: marcasDelHueco(h, intervalo).map((m) => ({ minuto: m, hora: horaEn(d, m), href: nuevaCita(b.id, m, d) })),
          etiqueta: `Agendar el ${fechaLarga(d)}, libre de ${horasEn(d, h)}`,
        })),
      };
    });
    const hoyEnLaSemana = semana.includes(hoy);
    laSemana = (
      <>
        <p className="mb-2 text-sm text-suave">
          Semana del {rangoDeFechas(semana[0]!, semana[6]!)} · <span className="font-medium text-texto">{b.nombre}</span>
          {activas.length === 0 && ' · Sin citas esta semana.'}
        </p>
        <GrillaDelDia
          columnas={dias}
          rango={rangoSemana}
          horas={etiquetasDe(rangoSemana)}
          ahora={hoyEnLaSemana ? { minuto: minutosDesdeElInicio(ahora, hoy, zona), texto: horaLocal(ahora, zona), columna: hoy } : undefined}
          seleccionada={abierta?.id}
          anchoMinimo="7rem"
        />
      </>
    );
  }

  const selectorDeVista = <SelectorDeVista vista={enSemana ? 'semana' : 'dia'} enlaces={{ dia: enlace({ vista: 'dia' }), semana: enlace({ vista: 'semana' }) }} />;

  // Un solo proveedor para la lista, la grilla y "marcar pasadas": lo marcado en uno se ve en todos.
  return (
    <ProveedorDeMarcado>
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
          <div className="flex shrink-0 items-center gap-3">
            {/* Sin filtro de barberos (el barbero, o un solo barbero), Día o Semana va aquí arriba. */}
            {ruta === '/agenda' && !conFiltro && selectorDeVista}
            <AccionPrincipal href={nuevaCita()} etiqueta="Nueva cita" Icono={CalendarPlus} />
          </div>
        </div>

        {arriba}
        {conFiltro && (
          <div className="mb-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <FiltroDeBarberos barberos={equipo} elegido={elegido?.id} enlace={(b) => enlace({ barbero: b })} todosSoloEnCelular={enSemana} />
            </div>
            {ruta === '/agenda' && selectorDeVista}
          </div>
        )}
        {conTira && (
          <div className="mb-4">
            {/* Seis semanas: en el PC se pasan con los botones de semana o la rueda; más lejos, el calendario. */}
            <TiraDeDias seleccionada={fecha} hoy={hoy} dias={DIAS_DE_LA_TIRA} semanas enlace={(f) => enlace({ fecha: f })} citasPorDia={puntos} />
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          {citas.length === 1 ? '1 cita' : `${citas.length} citas`}
          {elegido && ` de ${elegido.nombre}`}
        </p>

        {pasadas.length > 0 && <CompletarPasadas citas={pasadas} />}

        <div className="lg:hidden">
          {sigue && (
            <BloqueSigue cita={sigue.cita} enCurso={sigue.enCurso} zona={zona} conBarbero={esDueno && !unSoloBarbero} ahora={ahora} href={`/citas/${sigue.cita.id}`} />
          )}
          {citas.length === 0 && elementos.some((e) => e.tipo === 'hueco') && <p className="mb-2 text-sm text-suave">{sinCitas}</p>}
          <ListaDelDia elementos={elementos} vacia={<p>{sinCitas}</p>} />
        </div>

        {/* En el escritorio, lo de ahora y el día en números, arriba de la grilla. */}
        <div className={`mb-4 hidden items-stretch gap-4 ${enSemana ? '' : 'lg:flex'}`}>
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
            {enSemana ? (
              (laSemana ?? (
                <div className="rounded-xl border border-dashed border-borde bg-superficie px-6 py-10 text-center text-suave">
                  La semana se ve por barbero: elige uno arriba. Para ver a todo el equipo, usa la vista de día.
                </div>
              ))
            ) : grilla.length === 0 ? (
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
            {!enSemana && canceladas.length > 0 && (
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
    </ProveedorDeMarcado>
  );
}
