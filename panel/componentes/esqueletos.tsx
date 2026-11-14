import type { ReactNode } from 'react';

/**
 * Esqueletos de carga con la forma real de cada pantalla: al tocar un enlace, la pantalla cambia
 * enseguida aunque el servidor tarde, y cuando llegan los datos nada salta de lugar. Por eso cada
 * pieza copia el alto de lo que reemplaza (la altura de línea de cada tamaño de texto, los botones
 * de 44 px, las tarjetas con su relleno). Con "reducir movimiento" quedan quietos (globals.css).
 *
 * Los títulos fijos se muestran escritos: no dependen de los datos y orientan desde el primer
 * instante. Los que cambian (el nombre de un cliente, "Mis clientes" para el barbero) van en gris.
 * El loading.tsx no sabe quién entró (eso lo pide el servidor), así que Hoy y Agenda imitan la
 * vista del dueño, la que más cosas tiene.
 *
 * data-esqueleto="contenido" marca dónde empieza el contenido: e2e/esqueletos.spec.ts comprueba
 * que ahí mismo aparece el de verdad.
 */

function Bloque({ className }: { className: string }) {
  return <div className={`animate-latido rounded-md bg-hundido ${className}`} />;
}

/** Alto de la línea de texto y de la barra gris de cada tamaño de Tailwind. */
const LINEA = {
  xs: ['h-4', 'h-3'],
  sm: ['h-5', 'h-3.5'],
  base: ['h-6', 'h-4'],
  lg: ['h-7', 'h-5'],
  xl: ['h-7', 'h-5'],
  '2xl': ['h-8', 'h-6'],
  '3xl': ['h-9', 'h-7'],
} as const;
type Tamano = keyof typeof LINEA;

/** Una línea de texto: ocupa el alto de la línea real, con la barra centrada. */
function Linea({ t = 'base', ancho = 'w-1/2', className = '' }: { t?: Tamano; ancho?: string; className?: string }) {
  const [alto, barra] = LINEA[t];
  return (
    <div className={`flex items-center ${alto} ${className}`}>
      <Bloque className={`${barra} ${ancho}`} />
    </div>
  );
}

/** Con el mismo ancho estándar que la pantalla que se espera (globals.css). */
function Cargando({ children, ancho }: { children: ReactNode; ancho: 'ancho-formulario' | 'ancho-lista' | 'ancho-completo' }) {
  return (
    <div aria-busy="true" className={ancho}>
      <p className="sr-only" role="status">
        Cargando…
      </p>
      {children}
    </div>
  );
}

/** El h1 de la página: escrito si es fijo, en gris si depende de los datos. */
function Titulo({ texto, ancho = 'w-40', className = '' }: { texto?: string | undefined; ancho?: string; className?: string }) {
  if (texto === undefined) return <Linea t="2xl" ancho={ancho} className={className} />;
  return (
    <p aria-hidden className={`text-2xl font-semibold ${className}`}>
      {texto}
    </p>
  );
}

/**
 * La bajada del título (text-sm): `lineas` en el celular; desde 768 px cabe en `enPc` líneas.
 */
function Descripcion({ lineas = 1, enPc = 1, className = 'mb-4' }: { lineas?: number; enPc?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: lineas }, (_, i) => {
        const ultima = i === lineas - 1;
        const ultimaEnPc = i === enPc - 1;
        return (
          <Linea
            key={i}
            t="sm"
            ancho={`${ultima ? 'w-3/5' : 'w-full'} ${ultimaEnPc ? 'md:w-3/5' : ''}`}
            className={i >= enPc ? 'md:hidden' : ''}
          />
        );
      })}
    </div>
  );
}

/** Enlace "‹ Volver" de arriba (min-h-11 y mb-3). */
function Volver({ ancho = 'w-24' }: { ancho?: string }) {
  return (
    <div className="mb-3 flex h-11 items-center gap-1">
      <Bloque className="size-5 rounded" />
      <Bloque className={`h-3.5 ${ancho}`} />
    </div>
  );
}

function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-borde bg-superficie ${className}`}>{children}</div>;
}

/** Botón de 44 px. */
function Boton({ className = 'w-full' }: { className?: string }) {
  return <Bloque className={`h-11 rounded-lg ${className}`} />;
}

/** Campo de formulario: etiqueta, caja de 44 px y, si lleva, la ayuda debajo. */
function Campo({ conAyuda = false, ancho = 'w-28' }: { conAyuda?: boolean; ancho?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Linea t="sm" ancho={ancho} />
      <Boton />
      {conAyuda && <Linea t="sm" ancho="w-3/4" />}
    </div>
  );
}

/** Filas de una lista dentro de una tarjeta (min-h-16): nombre, detalle y la flecha. */
function FilasDeLista({ filas, conFlecha = true, alto = 'min-h-16 py-3' }: { filas: number; conFlecha?: boolean; alto?: string }) {
  return (
    <div className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 ${alto}`}>
          <div className="min-w-0 flex-1">
            <Linea ancho={i % 2 ? 'w-2/5' : 'w-1/2'} />
            <Linea t="sm" ancho={i % 2 ? 'w-1/3' : 'w-2/5'} />
          </div>
          {conFlecha && <Bloque className="size-5 shrink-0 rounded" />}
        </div>
      ))}
    </div>
  );
}

const ANCHOS_DE_BARBEROS = ['w-20', 'w-32', 'w-28', 'w-32', 'w-36'];

/** Hoy y Agenda: encabezado, barberos, días (Agenda), lo que sigue y la lista o la grilla. */
export function EsqueletoAgenda({ conTira = true }: { conTira?: boolean }) {
  return (
    <Cargando ancho="ancho-completo">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Linea t="sm" ancho="w-28" />
          <Linea t="2xl" ancho="w-24" />
          {conTira ? (
            <div className="flex h-11 items-center">
              <Bloque className="h-3.5 w-56" />
            </div>
          ) : (
            <Linea t="sm" ancho="w-44" />
          )}
          {/* El resumen del día, una línea bajo la fecha (solo en el escritorio). */}
          <div className="mt-1 hidden lg:block">
            <Linea t="sm" ancho="w-72" />
          </div>
        </div>
        <Boton className="hidden w-36 shrink-0 md:block" />
      </div>

      <div className="mb-3 flex gap-2 overflow-hidden pb-1">
        {ANCHOS_DE_BARBEROS.map((ancho, i) => (
          <Bloque key={i} className={`h-11 shrink-0 rounded-full ${ancho}`} />
        ))}
      </div>
      {conTira && (
        <div data-esqueleto="contenido" className="mb-4 flex items-center gap-2">
          <Boton className="hidden size-11 shrink-0 lg:block" />
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden pb-1">
            {Array.from({ length: 21 }, (_, i) => (
              <Bloque key={i} className="h-14 w-14 shrink-0 rounded-xl" />
            ))}
          </div>
          <Boton className="hidden size-11 shrink-0 lg:block" />
        </div>
      )}

      {/* Celular y tablet: lo que sigue y las tarjetas de citas. */}
      <div className="lg:hidden">
        <Tarjeta className="mb-4 p-4">
          <Linea t="sm" ancho="w-40" className="mb-1" />
          <Linea t="3xl" ancho="w-36" />
          <Linea t="lg" ancho="w-48" />
          <Linea t="sm" ancho="w-56" />
          <div className="mt-3 flex gap-2">
            <Boton className="w-28" />
            <Boton className="w-24" />
          </div>
        </Tarjeta>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-xl border border-l-4 border-borde bg-superficie py-3 pr-3 pl-3">
              <Linea t="xl" ancho="w-28" />
              <Bloque className="my-0.5 h-6 w-24 rounded-full" />
              <Linea ancho="w-40" />
              <Linea t="sm" ancho="w-48" />
              <Linea t="sm" ancho="w-40" />
            </div>
          ))}
        </div>
      </div>

      {/* Escritorio: lo que sigue y la grilla con la columna de horas. */}
      <div className="hidden lg:block">
        <div className="mb-4">
          <Tarjeta className="p-4">
            <Linea t="sm" ancho="w-44" className="mb-1" />
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Linea t="3xl" ancho="w-72" />
                <Linea t="sm" ancho="w-64" />
              </div>
              <div className="flex gap-2">
                <Boton className="w-24" />
                <Boton className="w-24" />
              </div>
            </div>
          </Tarjeta>
        </div>
        <div className="grid h-[calc(100dvh-13rem)] min-h-96 grid-cols-[4.5rem_repeat(3,minmax(0,1fr))] grid-rows-[auto_1fr] overflow-hidden rounded-xl border border-borde bg-superficie">
          <div className="border-b border-borde" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="border-b border-l border-borde px-3 py-2.5">
              <Linea t="sm" ancho="w-28" />
            </div>
          ))}
          <div className="flex flex-col gap-16 pt-1 pr-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Bloque key={i} className="ml-auto h-3 w-8" />
            ))}
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 border-l border-borde p-1">
              <Bloque className={`h-10 w-full ${i === 1 ? 'mt-20' : 'mt-1'}`} />
              <Bloque className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Cargando>
  );
}

/** Clientes: buscador, tabla desde 1024 px y lista en el celular. */
export function EsqueletoClientes() {
  const columnas = 'grid grid-cols-[1.4fr_1.2fr_1fr_1.5fr_0.8fr_7rem] items-center gap-4 px-4';
  return (
    <Cargando ancho="ancho-lista">
      <Titulo ancho="w-32" />
      <Descripcion />
      <Boton className="mb-4 w-full lg:max-w-xl" />
      <div data-esqueleto="contenido" className="hidden overflow-hidden rounded-xl border border-borde bg-superficie lg:block">
        <div className={`${columnas} h-[3.25rem] border-b border-borde bg-hundido`}>
          {['w-20', 'w-16', 'w-24', 'w-24', 'w-20'].map((ancho, i) => (
            <Bloque key={i} className={`h-3.5 bg-borde ${ancho} ${i === 4 ? 'justify-self-end' : ''}`} />
          ))}
        </div>
        <div className="divide-y divide-borde">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`${columnas} h-[4.25rem]`}>
              <Bloque className={`h-4 ${i % 2 ? 'w-3/5' : 'w-4/5'}`} />
              <Bloque className="h-4 w-4/5" />
              <Bloque className="h-4 w-3" />
              <Bloque className={`h-4 ${i % 3 ? 'w-3' : 'w-4/5'}`} />
              <Bloque className="h-4 w-3 justify-self-end" />
              <Bloque className="h-4 w-20 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
      <div data-esqueleto="contenido" className="lg:hidden">
        <FilasDeLista filas={8} alto="min-h-14 py-2" />
      </div>
    </Cargando>
  );
}

/** Por aprobar: tarjetas con el plazo, la cita y los dos botones. */
export function EsqueletoPorAprobar() {
  return (
    <Cargando ancho="ancho-lista">
      <Titulo texto="Por aprobar" />
      <Descripcion lineas={2} />
      <div data-esqueleto="contenido" className="flex flex-col gap-3">
        {Array.from({ length: 2 }, (_, i) => (
          <Tarjeta key={i} className="p-4">
            <Bloque className="mb-2 h-6 w-36 rounded-full" />
            <Linea ancho="w-4/5 sm:w-72" />
            <Linea ancho="w-40" />
            <Linea t="sm" ancho="w-56" className="mb-3" />
            <div className="grid grid-cols-2 gap-2">
              <Boton />
              <Boton />
            </div>
            <div className="mt-2 flex h-11 items-center justify-center">
              <Bloque className="h-3.5 w-24" />
            </div>
          </Tarjeta>
        ))}
      </div>
    </Cargando>
  );
}

/** Pestañas "Esperan a una persona / Todas" y la lista de conversaciones. */
function ListaDeConversaciones() {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div data-esqueleto="contenido" className="flex gap-1 rounded-xl bg-fondo p-1 ring-1 ring-borde">
        <Boton className="flex-1" />
        <Boton className="flex-1 opacity-50" />
      </div>
      <div className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <Linea ancho="w-36" />
              <Bloque className="h-3 w-12" />
            </div>
            <Linea t="sm" ancho="w-48" />
            <Linea t="sm" ancho="w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mensajes: la lista y, en el escritorio, el panel vacío a la derecha. */
export function EsqueletoMensajes() {
  return (
    <Cargando ancho="ancho-completo">
      <Titulo texto="Mensajes" />
      <Descripcion lineas={2} />
      <div className="lg:grid lg:h-[calc(100dvh-11rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
        <ListaDeConversaciones />
        <div className="hidden rounded-xl border border-dashed border-borde bg-superficie lg:block" />
      </div>
    </Cargando>
  );
}

/** Una conversación: en el escritorio, con la lista al lado; burbujas y el campo para responder. */
export function EsqueletoConversacion() {
  return (
    <Cargando ancho="ancho-completo">
      <div className="lg:grid lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6">
        <div className="hidden lg:block">
          <ListaDeConversaciones />
        </div>
        <div className="flex min-h-0 flex-col lg:rounded-xl lg:border lg:border-borde lg:bg-superficie">
          <div className="lg:border-b lg:border-borde lg:px-4 lg:py-3">
            <div className="mb-2 flex h-11 items-center gap-1 lg:hidden">
              <Bloque className="size-5 rounded" />
              <Bloque className="h-3.5 w-20" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Linea t="2xl" ancho="w-44" className="lg:h-7" />
                <Linea t="sm" ancho="w-32" />
              </div>
              <Boton className="w-24 shrink-0" />
            </div>
            <Bloque className="mt-3 h-14 w-full rounded-lg" />
          </div>
          <div className="my-4 flex flex-col gap-2 lg:my-0 lg:flex-1 lg:p-4">
            {['self-start w-3/5 lg:w-2/5', 'self-end w-3/4 lg:w-1/2', 'self-start w-1/2 lg:w-1/3'].map((c, i) => (
              <Bloque key={i} className={`h-14 rounded-xl ${c}`} />
            ))}
          </div>
          <div className="flex gap-2 border-t border-borde pt-2 pb-3 lg:px-4">
            <Bloque className="h-16 flex-1 rounded-lg" />
            <Boton className="w-28 self-end" />
          </div>
        </div>
      </div>
    </Cargando>
  );
}

/** Ajustes del negocio: lista de secciones en el celular; menú de secciones y la tarjeta en PC. */
export function EsqueletoAjustes() {
  return (
    <Cargando ancho="ancho-lista">
      <Titulo texto="Ajustes del negocio" className="mb-1" />
      <Descripcion lineas={2} />
      <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <div data-esqueleto="contenido" className="hidden flex-col gap-1 md:flex">
          {['w-32', 'w-16', 'w-36', 'w-28', 'w-28', 'w-36'].map((ancho, i) => (
            <div key={i} className={`flex h-11 items-center rounded-lg px-3 ${i === 0 ? 'bg-hundido/60' : ''}`}>
              <Bloque className={`h-3.5 ${ancho}`} />
            </div>
          ))}
        </div>
        <div data-esqueleto="contenido" className="md:hidden">
          <FilasDeLista filas={6} />
        </div>
        <Tarjeta className="hidden p-4 md:block lg:p-6">
          <Linea t="lg" ancho="w-40" className="mb-4" />
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Campo conAyuda />
              <Campo conAyuda ancho="w-36" />
            </div>
            <Campo conAyuda ancho="w-24" />
          </div>
        </Tarjeta>
      </div>
    </Cargando>
  );
}

/** Cuenta (del panel y del superadmin): quién es, contraseña, apariencia y salir. */
export function EsqueletoCuenta() {
  return (
    <Cargando ancho="ancho-formulario">
      <Titulo texto="Cuenta" className="mb-4" />
      <Tarjeta className="mb-4 p-4">
        <Linea t="lg" ancho="w-40" />
        <Linea t="sm" ancho="w-56" />
      </Tarjeta>
      <Tarjeta className="mb-4 flex items-center gap-3 p-4">
        <Bloque className="size-5 rounded" />
        <Bloque className="h-4 w-24" />
        <Bloque className="h-3 w-16" />
        <Boton className="ml-auto w-20" />
      </Tarjeta>
      <Tarjeta className="mb-4 p-4">
        <Linea ancho="w-28" className="mb-1" />
        <Descripcion lineas={2} className="mb-3" />
        <Linea t="sm" ancho="w-12" className="mb-1.5" />
        <Bloque className="h-12 w-full rounded-lg" />
      </Tarjeta>
      <Boton className="max-w-xs" />
    </Cargando>
  );
}

/** Barberos y servicios: la lista de barberos y "Agregar barbero". */
export function EsqueletoEquipo() {
  return (
    <Cargando ancho="ancho-lista">
      <Titulo texto="Barberos y servicios" />
      <Descripcion lineas={2} />
      <div data-esqueleto="contenido" className="mb-6">
        <FilasDeLista filas={4} alto="min-h-14 py-2" />
      </div>
      <Tarjeta className="p-4">
        <Linea ancho="w-36" className="mb-3" />
        <div className="flex flex-col gap-4">
          <Campo conAyuda ancho="w-16" />
          <Boton />
        </div>
      </Tarjeta>
    </Cargando>
  );
}

/**
 * Tarjetas con nombre, detalle y una acción abajo (Usuarios) o al lado (Bloqueos). Con
 * `titulo`, fijo; sin él, en gris (cambia según quién entró).
 */
export function EsqueletoTarjetas({
  titulo,
  lineas = 2,
  conAccionAbajo = false,
  conEtiqueta = false,
  filas = 3,
}: {
  titulo?: string;
  lineas?: number;
  conAccionAbajo?: boolean;
  conEtiqueta?: boolean;
  filas?: number;
}) {
  return (
    <Cargando ancho="ancho-lista">
      <div className="mb-1 flex items-end justify-between gap-3">
        <Titulo texto={titulo} />
        <Boton className="hidden w-36 shrink-0 md:block" />
      </div>
      <Descripcion lineas={2} />
      <div data-esqueleto="contenido" className="flex flex-col gap-2">
        {Array.from({ length: filas }, (_, i) => (
          <Tarjeta key={i} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Linea ancho="w-40" />
                {Array.from({ length: lineas - 1 }, (_, j) => (
                  <Linea key={j} t="sm" ancho={j ? 'w-32' : 'w-56'} />
                ))}
              </div>
              {conEtiqueta ? <Bloque className="h-5 w-14 shrink-0 rounded-full" /> : <Boton className="w-20 shrink-0" />}
            </div>
            {conAccionAbajo && <Boton className="mt-2 w-28" />}
          </Tarjeta>
        ))}
      </div>
    </Cargando>
  );
}

/** Plan: un contador por tarjeta, con su barra. */
export function EsqueletoPlan() {
  return (
    <Cargando ancho="ancho-lista">
      <Titulo ancho="w-48" />
      <Descripcion lineas={2} />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Tarjeta key={i} className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Linea ancho="w-44" />
              <Linea t="xl" ancho="w-16" />
            </div>
            <Bloque className="mb-2 h-2.5 w-full rounded-full" />
            <Linea t="sm" ancho="w-full md:w-3/5" />
            <Linea t="sm" ancho="w-2/5 md:hidden" />
          </Tarjeta>
        ))}
      </div>
    </Cargando>
  );
}

/** Base de conocimiento: el espacio usado y las preguntas. */
export function EsqueletoConocimiento() {
  return (
    <Cargando ancho="ancho-lista">
      <Titulo texto="Base de conocimiento" />
      <Descripcion lineas={3} enPc={2} />
      <Tarjeta className="mb-4 p-4">
        <div className="mb-1.5 flex justify-between gap-2">
          <Linea t="sm" ancho="w-28" />
          <Linea t="sm" ancho="w-36" />
        </div>
        <Bloque className="h-2 w-full rounded-full" />
        <Linea t="xs" ancho="w-4/5" className="mt-1.5" />
      </Tarjeta>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Tarjeta key={i} className="p-4">
            <Linea ancho="w-1/2" />
            <Linea t="sm" ancho="w-4/5" />
          </Tarjeta>
        ))}
      </div>
    </Cargando>
  );
}

/** El detalle de una cita: hora, estado, datos, contacto y acciones. */
export function EsqueletoCita() {
  return (
    <Cargando ancho="ancho-formulario">
      <Volver ancho="w-28" />
      <div className="mb-4">
        <Tarjeta className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Linea t="3xl" ancho="w-32" />
              <Linea ancho="w-4/5 sm:w-80" />
              <Linea ancho="w-2/5" className="sm:hidden" />
            </div>
            <Bloque className="h-5 w-24 shrink-0 rounded-full" />
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {['w-32', 'w-28', 'w-40', 'w-20'].map((ancho, i) => (
              <div key={i} className="contents">
                <Linea t="sm" ancho="w-14" />
                <Linea t="sm" ancho={ancho} />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Boton />
            <Boton />
          </div>
          <Linea t="xs" ancho="w-28" className="mt-2 justify-center" />
        </Tarjeta>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Boton />
        <Boton />
      </div>
    </Cargando>
  );
}

/** La ficha de un cliente: datos y contacto a la izquierda, historial a la derecha (PC). */
export function EsqueletoCliente() {
  return (
    <Cargando ancho="ancho-lista">
      <Volver ancho="w-16" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Tarjeta className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Linea t="2xl" ancho="w-44" />
              <Boton className="w-24 shrink-0" />
            </div>
            <Linea t="sm" ancho="w-56" className="mb-4" />
            <Linea t="lg" ancho="w-40" className="mb-2" />
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Boton />
              <Boton />
            </div>
            <Boton />
          </Tarjeta>
          <Tarjeta className="p-4">
            <Linea ancho="w-32" />
            <Descripcion lineas={3} enPc={3} className="mb-3" />
            <Boton />
          </Tarjeta>
        </div>
        <div>
          <Linea ancho="w-32" className="mb-3" />
          <FilasDeLista filas={3} conFlecha={false} />
        </div>
      </div>
    </Cargando>
  );
}

/** Un barbero: nombre, pestañas (Servicios, Horario, Acceso, Datos) y la sección abierta. */
export function EsqueletoBarbero() {
  return (
    <Cargando ancho="ancho-formulario">
      <Volver ancho="w-36" />
      <Titulo ancho="w-40" className="mb-4" />
      <div className="mb-4 flex gap-1 rounded-xl bg-fondo p-1 ring-1 ring-borde">
        {Array.from({ length: 4 }, (_, i) => (
          <Boton key={i} className={`flex-1 ${i ? 'opacity-50' : ''}`} />
        ))}
      </div>
      <Tarjeta className="p-4">
        <Linea ancho="w-40" />
        <Descripcion lineas={2} className="mb-4" />
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-borde px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Linea ancho="w-20" />
              <Linea t="sm" ancho="w-28" />
            </div>
            <Boton className="w-24" />
          </div>
          <Boton />
        </div>
        <div className="flex flex-col gap-4">
          <Campo ancho="w-16" />
          <div className="grid grid-cols-2 gap-4">
            <Campo ancho="w-24" />
            <Campo ancho="w-20" />
          </div>
          <Boton />
        </div>
      </Tarjeta>
    </Cargando>
  );
}

/**
 * Formularios: "‹ Volver", el título, la bajada y los campos. `enTarjeta` cuando el formulario va
 * dentro de una tarjeta (Nuevo negocio).
 */
export function EsqueletoFormulario({
  titulo,
  descripcion = 0,
  campos = 4,
  enTarjeta = false,
}: {
  titulo?: string;
  /** Líneas de la bajada en el celular (0: sin bajada). */
  descripcion?: number;
  campos?: number;
  enTarjeta?: boolean;
}) {
  const formulario = (
    <div className="flex flex-col gap-4">
      {Array.from({ length: campos }, (_, i) => (
        <Campo key={i} ancho={['w-28', 'w-36', 'w-24', 'w-32'][i % 4]} />
      ))}
      <Boton />
    </div>
  );
  return (
    <Cargando ancho="ancho-formulario">
      <Volver />
      <Titulo texto={titulo} className={descripcion ? 'mb-1' : 'mb-4'} />
      {descripcion > 0 && <Descripcion lineas={descripcion} />}
      {enTarjeta ? <Tarjeta className="p-4">{formulario}</Tarjeta> : formulario}
    </Cargando>
  );
}

/** Nueva cita: el buscador del cliente y los recientes. */
export function EsqueletoNuevaCita() {
  return (
    <Cargando ancho="ancho-formulario">
      <Volver ancho="w-16" />
      <Titulo texto="Nueva cita" className="mb-4" />
      <Linea t="sm" ancho="w-14" className="mb-2" />
      <Boton />
      <Linea t="xs" ancho="w-20" className="mt-4 mb-1.5" />
      <FilasDeLista filas={6} conFlecha={false} alto="min-h-14 py-2" />
    </Cargando>
  );
}

/** Reprogramar: los días, la fecha elegida y las horas libres. */
export function EsqueletoReprogramar() {
  return (
    <Cargando ancho="ancho-formulario">
      <Volver ancho="w-28" />
      <Titulo texto="Reprogramar" />
      <Descripcion lineas={2} />
      <div className="mb-4 flex gap-2 overflow-hidden pb-1">
        {Array.from({ length: 10 }, (_, i) => (
          <Bloque key={i} className="h-14 w-14 shrink-0 rounded-xl" />
        ))}
      </div>
      <Linea ancho="w-52" className="mb-2" />
      <Linea t="sm" ancho="w-10" />
      <Linea t="xs" ancho="w-28" className="my-2" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Boton key={i} />
        ))}
      </div>
    </Cargando>
  );
}

/** Superadmin: buscador, filtros por estado y WhatsApp, y la lista de negocios. */
export function EsqueletoNegocios() {
  const filtro = (anchos: string[]) => (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
      <Linea t="sm" ancho="w-16" className="sm:mr-1" />
      <div className="flex gap-1.5 overflow-hidden">
        {anchos.map((ancho, i) => (
          <Bloque key={i} className={`h-11 shrink-0 rounded-full ${ancho}`} />
        ))}
      </div>
    </div>
  );
  return (
    <Cargando ancho="ancho-completo">
      <div className="mb-1 flex items-end justify-between gap-3">
        <Titulo texto="Negocios" />
        <Boton className="w-40 shrink-0" />
      </div>
      <Linea t="sm" ancho="w-64" className="mb-4" />
      <div className="mb-4 flex flex-col gap-3">
        <Boton className="w-full sm:max-w-md" />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
          {filtro(['w-20', 'w-20', 'w-24', 'w-28'])}
          {filtro(['w-20', 'w-32', 'w-32'])}
        </div>
      </div>
      <FilasDeLista filas={4} />
    </Cargando>
  );
}

/** Superadmin, un negocio: estado y WhatsApp a la izquierda, usuarios a la derecha (PC). */
export function EsqueletoNegocio() {
  const encabezado = (
    <>
      <Linea ancho="w-28" />
      <Linea t="sm" ancho="w-56" className="mb-3" />
    </>
  );
  return (
    <Cargando ancho="ancho-completo">
      <Volver ancho="w-20" />
      <div className="mb-1 flex items-center gap-3">
        <Linea t="2xl" ancho="w-48" />
        <Bloque className="h-5 w-20 rounded-full" />
      </div>
      <Linea t="sm" ancho="w-72 max-w-full" className="mb-4" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Tarjeta className="p-4 lg:p-6">
            {encabezado}
            <Boton />
          </Tarjeta>
          <Tarjeta className="p-4 lg:p-6">
            {encabezado}
            <div className="border-y border-borde py-3">
              <Linea ancho="w-40" />
              <Linea t="xs" ancho="w-56" className="mb-2" />
              <Boton />
            </div>
          </Tarjeta>
        </div>
        <Tarjeta className="p-4 lg:p-6">
          {encabezado}
          <div className="divide-y divide-borde border-y border-borde">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="py-3">
                <Linea ancho="w-36" />
                <Linea t="sm" ancho="w-56" />
                <Linea t="sm" ancho="w-16" />
                <Boton className="mt-2 w-28" />
              </div>
            ))}
          </div>
        </Tarjeta>
      </div>
    </Cargando>
  );
}
