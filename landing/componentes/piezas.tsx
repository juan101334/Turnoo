import type { CSSProperties, ReactNode } from 'react';

/**
 * Piezas visuales de la landing: el chat de WhatsApp de ejemplo, los avisos que llegan por
 * WhatsApp, el ticket de turno y los marcos de las capturas del panel. Todo es HTML y CSS: no hay
 * fotos de stock ni ilustraciones. Las capturas son del panel de verdad con datos inventados
 * (ver landing/README.md).
 */

// ---------------------------------------------------------------------
// Chat de WhatsApp
// ---------------------------------------------------------------------

interface Mensaje {
  de: 'cliente' | 'negocio';
  texto: string;
  hora: string;
}

/** Un cliente agenda un corte. Así responde el asistente: corto, con cupos reales y el precio. */
const CONVERSACION: Mensaje[] = [
  { de: 'cliente', texto: 'Buenas, ¿tienen turno mañana para corte y barba?', hora: '4:12 p. m.' },
  { de: 'negocio', texto: 'Hola, Mateo. Mañana con Andrés hay cupo a las 10:00 a. m. o a las 11:30 a. m. ¿Cuál te sirve?', hora: '4:12 p. m.' },
  { de: 'cliente', texto: 'A las 10 de una', hora: '4:13 p. m.' },
  { de: 'negocio', texto: 'Listo, quedaste mañana a las 10:00 a. m. con Andrés para corte y barba. Vale $35.000. Te escribo antes para recordarte.', hora: '4:13 p. m.' },
  { de: 'cliente', texto: 'Gracias, parce', hora: '4:14 p. m.' },
];

/** Los globos aparecen uno tras otro. Con "reducir movimiento" salen todos de una vez (globals.css). */
const ESPERA_ENTRE_GLOBOS_MS = 850;

export function ChatDeWhatsapp() {
  return (
    <figure className="w-full max-w-[21.5rem]">
      <div className="overflow-hidden rounded-[2.1rem] border-[9px] border-tinta bg-chat-fondo shadow-[7px_7px_0_var(--color-marca)]">
        <div className="flex items-center gap-2.5 border-b border-linea bg-hoja px-3.5 py-2.5">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-semibold text-white">
            LE
          </span>
          <p className="min-w-0 leading-tight">
            <span className="block truncate font-semibold">Barbería La Esquina</span>
            <span className="block text-xs text-suave">Cuenta de empresa</span>
          </p>
        </div>
        <ol aria-label="Conversación de ejemplo por WhatsApp" className="flex min-h-[23.5rem] flex-col gap-2 px-3 py-3.5">
          {CONVERSACION.map((m, i) => (
            <li
              key={i}
              style={{ animationDelay: `${400 + i * ESPERA_ENTRE_GLOBOS_MS}ms` }}
              className={`animate-globo max-w-[84%] rounded-xl px-3 pt-1.5 pb-1 text-[0.94rem] leading-snug shadow-[0_1px_0_rgb(21_32_43/0.12)] ${
                m.de === 'cliente' ? 'self-end rounded-tr-sm bg-chat-propio' : 'self-start rounded-tl-sm bg-hoja'
              }`}
            >
              <span className="sr-only">{m.de === 'cliente' ? 'Cliente: ' : 'Barbería: '}</span>
              {m.texto}
              <span className="mt-0.5 block text-right text-[0.68rem] text-suave">{m.hora}</span>
            </li>
          ))}
        </ol>
        <div aria-hidden className="flex items-center gap-2 bg-chat-fondo px-3 pb-3">
          <span className="flex h-10 flex-1 items-center rounded-full bg-hoja px-4 text-sm text-suave">Mensaje</span>
          <span className="size-10 shrink-0 rounded-full bg-marca" />
        </div>
      </div>
      {/* A la derecha y angosto: el ticket del hero se monta sobre la esquina izquierda. */}
      <figcaption className="mt-3 ml-auto max-w-[11.5rem] text-right text-sm text-suave">Conversación de ejemplo. Responde el asistente.</figcaption>
    </figure>
  );
}

/** Un mensaje de plantilla tal como llega por WhatsApp: título, cuerpo y pie. */
export function AvisoDeWhatsapp({ titulo, children, pie, hora }: { titulo: string; children: ReactNode; pie?: string; hora: string }) {
  return (
    <div className="max-w-[20rem] rounded-xl rounded-tl-sm bg-hoja px-3.5 pt-2.5 pb-1.5 text-[0.94rem] leading-snug text-tinta shadow-[0_1px_0_rgb(21_32_43/0.15)]">
      <p className="font-semibold">{titulo}</p>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
      {pie && <p className="mt-1.5 text-xs text-suave">{pie}</p>}
      <p className="mt-0.5 text-right text-[0.68rem] text-suave">{hora}</p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Ticket de turno
// ---------------------------------------------------------------------

/** El motivo de la marca: un turno numerado, con el borde perforado. `muesca`: color del fondo donde va. */
export function Ticket({ numero, children, className = '', muesca }: { numero: string; children: ReactNode; className?: string; muesca?: string }) {
  return (
    <div className={`ticket w-52 rounded-t-lg bg-hoja px-6 pt-4 pb-7 text-tinta ${className}`} style={muesca ? ({ '--muesca': muesca } as CSSProperties) : undefined}>
      <p className="sello text-suave">Turno</p>
      <p className="titular mt-1 text-[3.4rem] text-marca">
        <span className="align-top text-[1.4rem] tracking-normal">N.º</span> {numero}
      </p>
      <div className="ticket-corte mt-3 pt-3 text-sm leading-snug">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Marcos para las capturas del panel
// ---------------------------------------------------------------------

/** Captura del panel en el computador (2240 x 1400 px, al doble de resolución). */
export function MarcoDeNavegador({ src, alt, direccion }: { src: string; alt: string; direccion: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border-2 border-tinta bg-hoja shadow-[7px_7px_0_var(--color-tinta)]">
      <div aria-hidden className="flex items-center gap-1.5 border-b-2 border-tinta bg-papel px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full border-[1.5px] border-tinta" />
        ))}
        <span className="mx-auto truncate rounded-md border border-linea-fuerte bg-hoja px-3 py-0.5 text-xs text-suave">{direccion}</span>
      </div>
      <img src={src} alt={alt} width={2240} height={1400} loading="lazy" decoding="async" className="block h-auto w-full" />
    </figure>
  );
}

/** Captura del panel en el celular (780 x 1560 px, al doble de resolución). */
export function MarcoDeCelular({ src, alt, sombra = 'shadow-[7px_7px_0_var(--color-marca)]' }: { src: string; alt: string; /** Sobre un fondo azul, la sombra va en otro tono. */ sombra?: string }) {
  return (
    <figure className={`w-[15.5rem] shrink-0 overflow-hidden rounded-[2.1rem] border-[9px] border-tinta bg-tinta ${sombra}`}>
      <img src={src} alt={alt} width={780} height={1560} loading="lazy" decoding="async" className="block h-auto w-full rounded-[1.5rem]" />
    </figure>
  );
}
