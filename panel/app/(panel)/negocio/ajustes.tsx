'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent } from 'react';
import { useAvisar } from '@/componentes/avisos-flotantes';
import { DialogoConfirmar } from '@/componentes/dialogo-confirmar';
import { Campo, CampoSeleccion } from '@/componentes/formulario';
import {
  fijarValores,
  NotaSinAvisoAlCerrar,
  soltarCentinela,
  useApilarEnHistorial,
  useReemplazarEnHistorial,
  useCambiosDelFormulario,
  useCambiosSinGuardar,
} from '@/componentes/guardia-de-salida';
import { GRUPOS_DE_CONFIGURACION, type CampoDeConfiguracion } from '@/lib/administracion';
import {
  AVISO_DE_INTERVALO,
  avisoDeCambioDeZona,
  corrimientoDeZona,
  efectoDeCancelaciones,
  efectoDeRecordatorio,
  leerSeccion,
  mensajeDelResultado,
  partesConCambios,
  resumenDeSeccion,
  seccionDelCampo,
  SECCIONES_DE_AJUSTES,
} from '@/lib/ajustes';
import { guardarAjustes } from './acciones';

/** En el historial: la sección se abrió desde la lista del celular (atrás vuelve a la lista). */
const DESDE_LISTA = 'turnooAjustesDesdeLista';
const RUTA = '/negocio';
const ID_FORMULARIO = 'ajustes';

const urlDe = (seccion: string | null) => (seccion ? `${RUTA}?seccion=${seccion}` : RUTA);
const estadoActual = () => (window.history.state as Record<string, unknown> | null) ?? {};

function CampoDeRegla({ campo, valor }: { campo: CampoDeConfiguracion; valor: string }) {
  const id = `regla-${campo.clave}`;
  if (campo.tipo === 'intervalo') {
    return (
      <CampoSeleccion id={id} name={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda} defaultValue={valor}>
        {campo.opciones.map((m) => (
          <option key={m} value={m}>
            {m === 60 ? '1 hora' : `${m} minutos`}
          </option>
        ))}
      </CampoSeleccion>
    );
  }
  if (campo.tipo === 'hora') {
    return <Campo id={id} name={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda} type="time" required defaultValue={valor} />;
  }
  return (
    <Campo
      id={id}
      name={campo.clave}
      etiqueta={`${campo.etiqueta} (${campo.unidad})`}
      ayuda={campo.ayuda}
      type="number"
      inputMode="numeric"
      min={campo.min}
      max={campo.max}
      step={1}
      required={!campo.opcional}
      defaultValue={valor}
    />
  );
}

/** "Con esto: …": qué pasa con los valores que hay escritos ahora. */
function Efecto({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="mt-4 rounded-lg bg-hundido px-3 py-2.5 text-sm">{texto}</p>;
}

/**
 * Ajustes del negocio por secciones, en un solo formulario: cambiar de sección no pierde lo
 * escrito, y una barra abajo (solo con cambios) guarda o descarta todo junto.
 * - Desde 768 px: pestañas a la izquierda y la sección elegida a la derecha.
 * - Celular: la lista de secciones con un resumen; cada una abre su propia pantalla (atrás vuelve
 *   a la lista).
 * La sección va en ?seccion= para poder enlazarla (Primeros pasos lleva a ?seccion=datos).
 */
export function Ajustes({ valores, zonas, seccionInicial }: { valores: Record<string, string>; zonas: string[]; seccionInicial: string | null }) {
  const formulario = useRef<HTMLFormElement>(null);
  const [seccion, setSeccion] = useState(seccionInicial);
  const activa = seccion ?? 'datos';
  const { cambiados, valores: escritos, revisar } = useCambiosDelFormulario(formulario);
  const actuales = { ...valores, ...escritos };
  const [enviando, iniciar] = useTransition();
  const [fallo, setFallo] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<{ zona: string | null; intervalo: boolean } | null>(null);
  const avisar = useAvisar();
  const apilar = useApilarEnHistorial();
  const reemplazar = useReemplazarEnHistorial();
  /** A dónde llevar el foco después de cambiar de pantalla en el celular. */
  const enfocar = useRef<{ a: 'seccion' | 'lista'; desde: string | null } | null>(null);

  const hayCambios = cambiados.length > 0;
  const { sinAvisoAlCerrar } = useCambiosSinGuardar(hayCambios && !enviando, {
    // Otra sección de Ajustes es el mismo formulario: no se pierde nada.
    esSegura: (destino) => destino.pathname === RUTA,
    atrasSeguro: () => Boolean(estadoActual()[DESDE_LISTA]),
  });
  const seccionesConCambios = new Set(cambiados.map(seccionDelCampo));

  // Atrás y adelante del navegador entre la lista y una sección (celular).
  useEffect(() => {
    const alVolver = () => {
      const nueva = leerSeccion(new URLSearchParams(window.location.search).get('seccion'));
      setSeccion((antes) => {
        if (nueva === null && antes !== null) enfocar.current = { a: 'lista', desde: antes };
        return nueva;
      });
    };
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  useEffect(() => {
    const destino = enfocar.current;
    enfocar.current = null;
    if (!destino) return;
    const elemento = destino.a === 'seccion' ? document.getElementById(`titulo-${seccion}`) : document.querySelector<HTMLElement>(`[data-lista="${destino.desde}"]`);
    elemento?.focus();
  }, [seccion]);

  /** Pestaña (escritorio): reemplaza la dirección sin agregar historial, con el centinela intacto. */
  function irAPestana(e: MouseEvent, id: string) {
    e.preventDefault();
    setSeccion(id);
    reemplazar(urlDe(id));
  }

  /** Lista del celular: la sección es otra pantalla, y atrás vuelve a la lista. */
  function abrirDesdeLista(e: MouseEvent, id: string) {
    e.preventDefault();
    enfocar.current = { a: 'seccion', desde: null };
    setSeccion(id);
    apilar(urlDe(id), { [DESDE_LISTA]: true });
    window.scrollTo({ top: 0 });
  }

  function volverALista(e: MouseEvent) {
    e.preventDefault();
    if (estadoActual()[DESDE_LISTA]) return window.history.back();
    enfocar.current = { a: 'lista', desde: seccion };
    setSeccion(null);
    reemplazar(RUTA);
  }

  /** Mostrar una sección (por ejemplo, la del campo con error) en el tamaño que sea. */
  function mostrar(id: string) {
    if (id === seccion) return;
    setSeccion(id);
    reemplazar(urlDe(id));
  }

  /** Después de guardar o descartar, la barra desaparece: el foco va al título de la sección. */
  function enfocarSeccion() {
    requestAnimationFrame(() => {
      const titulo = document.getElementById(`titulo-${activa}`);
      if (titulo && titulo.offsetParent !== null) titulo.focus();
    });
  }

  function alGuardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.checkValidity()) {
      const invalido = f.querySelector<HTMLInputElement | HTMLSelectElement>(':invalid');
      if (invalido) {
        mostrar(seccionDelCampo(invalido.name));
        setTimeout(() => invalido.reportValidity(), 0);
      }
      return;
    }
    // Solo la zona horaria y el intervalo piden confirmar: cambian cómo se ven o se ofrecen las citas.
    const zona = cambiados.includes('zonaHoraria') ? avisoDeCambioDeZona(corrimientoDeZona(valores.zonaHoraria!, actuales.zonaHoraria!, new Date())) : null;
    const intervalo = cambiados.includes('intervaloMinutos');
    if (zona || intervalo) setConfirmacion({ zona, intervalo });
    else enviar();
  }

  function enviar() {
    const f = formulario.current;
    if (!f) return;
    const datos = new FormData(f);
    const partes = partesConCambios(cambiados);
    soltarCentinela(() => iniciar(async () => {
      const resultado = await guardarAjustes(partes, datos);
      // Lo que se guardó pasa a ser lo guardado (con lo que dejó el backend); lo demás sigue pendiente.
      for (const parte of partes) {
        const r = resultado[parte];
        if (r && 'valores' in r) fijarValores(f, r.valores);
      }
      revisar();
      const mensaje = mensajeDelResultado(resultado);
      setFallo(mensaje);
      if (!mensaje) {
        avisar('Ajustes guardados.');
        enfocarSeccion();
      }
    }));
  }

  function descartar() {
    formulario.current?.reset();
    setFallo(null);
    enfocarSeccion();
  }

  const titulos = { zona: '¿Cambiar la zona horaria?', intervalo: '¿Cambiar el intervalo de la agenda?', ambos: '¿Guardar estos cambios?' };
  const tituloConfirmacion = confirmacion?.zona && confirmacion.intervalo ? titulos.ambos : confirmacion?.zona ? titulos.zona : titulos.intervalo;
  const n = cambiados.length;

  return (
    <div className="ancho-lista">
      <h1 className={`mb-1 text-2xl font-semibold ${seccion !== null ? 'max-md:sr-only' : ''}`}>Ajustes del negocio</h1>
      <p className={`mb-4 text-sm text-suave ${seccion !== null ? 'max-md:hidden' : ''}`}>
        Las reglas las siguen el asistente de WhatsApp y el panel, y se aplican a las citas nuevas.
      </p>

      <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Secciones de ajustes" className="hidden md:sticky md:top-6 md:block">
          <ul className="flex flex-col gap-1">
            {SECCIONES_DE_AJUSTES.map((s) => (
              <li key={s.id}>
                <a
                  href={urlDe(s.id)}
                  onClick={(e) => irAPestana(e, s.id)}
                  aria-current={s.id === activa ? 'page' : undefined}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-suave transition-colors duration-150 hover:bg-hundido hover:text-texto aria-[current=page]:bg-marca-suave aria-[current=page]:text-marca-oscura"
                >
                  <span className="flex-1">{s.titulo}</span>
                  {seccionesConCambios.has(s.id) && (
                    <>
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-aviso" />
                      <span className="sr-only">(con cambios sin guardar)</span>
                    </>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {seccion === null && (
            <nav aria-label="Secciones de ajustes" className="md:hidden">
              <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
                {SECCIONES_DE_AJUSTES.map((s) => (
                  <li key={s.id}>
                    <a href={urlDe(s.id)} data-lista={s.id} onClick={(e) => abrirDesdeLista(e, s.id)} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-fondo">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.titulo}</span>
                        <span className="line-clamp-2 block text-sm text-suave">{resumenDeSeccion(s.id, actuales)}</span>
                      </span>
                      {seccionesConCambios.has(s.id) && <span className="shrink-0 text-xs font-semibold text-aviso">Sin guardar</span>}
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-suave" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {seccion !== null && (
            <a href={RUTA} onClick={volverALista} className="-ml-2 mb-2 flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-semibold text-marca hover:bg-marca-suave md:hidden">
              <ChevronLeft aria-hidden className="size-5" />
              Ajustes
            </a>
          )}

          <form id={ID_FORMULARIO} ref={formulario} noValidate onSubmit={alGuardar} className={seccion === null ? 'hidden md:block' : undefined}>
            <section hidden={activa !== 'datos'} aria-labelledby="titulo-datos" className="rounded-xl border border-borde bg-superficie p-4 lg:p-6">
              <h2 id="titulo-datos" tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
                Datos del negocio
              </h2>
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} defaultValue={valores.nombre} autoComplete="organization" ayuda="Así lo nombra el asistente en WhatsApp." />
                  <Campo
                    id="telefonoAvisos"
                    name="telefonoAvisos"
                    etiqueta="WhatsApp para avisos"
                    type="tel"
                    inputMode="tel"
                    maxLength={30}
                    defaultValue={valores.telefonoAvisos}
                    ayuda="Aquí te llegan los avisos de clientes que piden hablar con una persona y del uso del plan. Vacío: sin avisos."
                    autoComplete="off"
                  />
                </div>
                <CampoSeleccion
                  id="zonaHoraria"
                  name="zonaHoraria"
                  etiqueta="Zona horaria"
                  defaultValue={valores.zonaHoraria}
                  ayuda={'Define qué es "hoy" y a qué hora se muestran las citas. Cámbiala solo si el negocio está en otro país.'}
                >
                  {zonas.map((z) => (
                    <option key={z} value={z}>
                      {z.replaceAll('_', ' ')}
                    </option>
                  ))}
                </CampoSeleccion>
              </div>
            </section>

            {GRUPOS_DE_CONFIGURACION.map((grupo) => (
              <section key={grupo.id} hidden={activa !== grupo.id} aria-labelledby={`titulo-${grupo.id}`} className="rounded-xl border border-borde bg-superficie p-4 lg:p-6">
                <h2 id={`titulo-${grupo.id}`} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
                  {grupo.titulo}
                </h2>
                <div className="grid gap-4 xl:grid-cols-2">
                  {grupo.campos.map((campo) => (
                    <CampoDeRegla key={campo.clave} campo={campo} valor={valores[campo.clave] ?? ''} />
                  ))}
                </div>
                {grupo.id === 'cancelaciones' && <Efecto texto={efectoDeCancelaciones(actuales)} />}
                {grupo.id === 'recordatorios' && <Efecto texto={efectoDeRecordatorio(actuales)} />}
              </section>
            ))}
          </form>

          {hayCambios && (
            <div
              role="region"
              aria-label="Cambios sin guardar"
              className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-3 shadow-flotante sm:flex-row sm:items-center md:bottom-4"
            >
              <div className="min-w-0 flex-1 text-sm">
                {fallo ? (
                  <p role="alert" className="text-peligro">
                    {fallo}
                  </p>
                ) : (
                  <p role="status">
                    <strong className="font-semibold">{n === 1 ? '1 cambio' : `${n} cambios`}</strong> sin guardar
                  </p>
                )}
                {sinAvisoAlCerrar && <NotaSinAvisoAlCerrar />}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={descartar}
                  disabled={enviando}
                  className="min-h-11 flex-1 cursor-pointer rounded-lg border border-borde px-4 font-semibold transition-colors duration-150 hover:bg-hundido disabled:cursor-wait disabled:opacity-70 sm:flex-none"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  form={ID_FORMULARIO}
                  disabled={enviando}
                  className="min-h-11 flex-1 cursor-pointer rounded-lg bg-marca px-4 font-semibold text-white transition-colors duration-150 hover:bg-marca-oscura disabled:cursor-wait disabled:opacity-70 sm:flex-none"
                >
                  {enviando ? 'Guardando…' : fallo ? 'Reintentar' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogoConfirmar
        abierto={confirmacion !== null}
        titulo={tituloConfirmacion}
        confirmar="Guardar"
        alConfirmar={() => {
          setConfirmacion(null);
          enviar();
        }}
        alCancelar={() => setConfirmacion(null)}
      >
        {confirmacion?.zona && <p>{confirmacion.zona}</p>}
        {confirmacion?.intervalo && <p>{AVISO_DE_INTERVALO}</p>}
      </DialogoConfirmar>
    </div>
  );
}
