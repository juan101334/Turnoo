import { ArrowDown, Check, ChevronDown, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { AvisoDeWhatsapp, ChatDeWhatsapp, MarcoDeCelular, MarcoDeNavegador, Ticket } from '@/componentes/piezas';
import { cantidad, DIAS_DE_PRUEBA, enlaceDeWhatsapp, PANEL, pesos, PLANES } from '@/lib/sitio';

/**
 * Landing de Turnoo. Una sola página estática, sin JavaScript propio: el menú son anclas, las
 * preguntas son <details> y la animación del chat es CSS. Todo lo que dice sale del código o de
 * docs/CONTEXTO.md; lo que depende de Meta o de lo legal va marcado con [CONFIRMAR].
 */

const MENU = [
  { href: '#como-funciona', texto: 'Cómo funciona' },
  { href: '#precios', texto: 'Precios' },
  { href: '#faq', texto: 'FAQ' },
];

/** Botón que abre WhatsApp con el mensaje ya escrito. */
function BotonDeWhatsapp({ children, mensaje, className = '' }: { children: ReactNode; mensaje?: string; className?: string }) {
  return (
    <a href={enlaceDeWhatsapp(mensaje)} target="_blank" rel="noopener" className={`boton bg-marca text-white ${className}`}>
      <MessageCircle aria-hidden className="size-5 shrink-0" />
      {children}
    </a>
  );
}

function Logo({ className = '' }: { className?: string }) {
  return <img src="/marca/turnoo-wordmark.svg" alt="Turnoo" width={3048} height={734} className={`w-auto ${className}`} />;
}

/** Lo que falta confirmar antes de publicar: se ve a propósito, para que no pase de largo. */
function Confirmar({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-marca-suave px-1 font-semibold text-marca-oscura">[CONFIRMAR: {children}]</mark>;
}

function Puntos({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-5 flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <Check aria-hidden strokeWidth={3} className="mt-1 size-4 shrink-0 text-marca" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Una función: texto a un lado y el producto al otro. `alReves` cambia el lado en el escritorio. */
function Funcion({ sello, titulo, children, puntos, imagen, alReves = false }: { sello: string; titulo: string; children: ReactNode; puntos: ReactNode[]; imagen: ReactNode; alReves?: boolean }) {
  return (
    <article className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
      <div className={`lg:col-span-5 ${alReves ? 'lg:order-2 lg:col-start-8' : ''}`}>
        <p className="sello text-marca">{sello}</p>
        <h3 className="titular mt-2 text-[2rem] sm:text-[2.6rem]">{titulo}</h3>
        <p className="mt-4 text-lg text-suave">{children}</p>
        <Puntos items={puntos} />
      </div>
      <div className={`lg:col-span-7 ${alReves ? 'lg:order-1 lg:col-start-1 lg:row-start-1' : ''}`}>{imagen}</div>
    </article>
  );
}

const PASOS = [
  {
    titulo: 'Tu cliente escribe',
    texto: 'Al WhatsApp de la barbería, como siempre. Con texto o con una nota de voz.',
  },
  {
    titulo: 'La IA le da turno',
    texto: 'Mira los cupos libres de cada barbero y agenda. Si el cliente lo pide, también cambia o cancela la cita.',
  },
  {
    titulo: 'Tú ves todo en la agenda',
    texto: 'Cada cita aparece en el panel, en tu celular o en el computador. No copias nada a mano.',
  },
];

const PREGUNTAS: { pregunta: string; respuesta: ReactNode }[] = [
  {
    pregunta: '¿Tengo que instalar algo?',
    respuesta: 'No. Tus clientes usan el WhatsApp de siempre. Tú y tus barberos entran al panel desde el navegador del celular o del computador.',
  },
  {
    pregunta: '¿Puedo usar el número de WhatsApp que ya tiene mi barbería?',
    respuesta: (
      <>
        Turnoo conecta el número de la barbería a la plataforma de WhatsApp para empresas, y esa conexión la hacemos contigo.{' '}
        <Confirmar>si el número actual se puede conectar y si sigue funcionando en la aplicación de WhatsApp Business, según las reglas de Meta</Confirmar>
      </>
    ),
  },
  {
    pregunta: '¿Qué pasa si el asistente no sabe responder algo?',
    respuesta:
      'No inventa. Le dice al cliente que una persona le va a responder, te avisa por WhatsApp con el motivo y deja de contestar en esa conversación durante 2 horas. Solo habla de tu negocio: si le preguntan otra cosa, tampoco responde.',
  },
  {
    pregunta: '¿Qué cuenta como una conversación de IA?',
    respuesta:
      'Cada cliente que el asistente atiende cuenta una sola vez en el mes, aunque escriba muchas veces. Al llegar al 80% del plan te avisamos. Si llegas al 100%, los clientes que el asistente todavía no ha atendido ese mes pasan directo a ti; los que ya venía atendiendo siguen con el asistente.',
  },
  {
    pregunta: '¿Mis clientes pueden cancelar o cambiar la cita?',
    respuesta: 'Sí, por el mismo WhatsApp. Por defecto pueden hacerlo hasta 2 horas antes de la cita, y ese tiempo lo ajustas tú en el panel.',
  },
  {
    pregunta: '¿El asistente entiende notas de voz?',
    respuesta: 'Sí, las de hasta 2 minutos. Si llega una más larga, le pide al cliente que la envíe más corta o que lo escriba.',
  },
  {
    pregunta: '¿Cómo se paga después de la prueba?',
    respuesta: `Los ${DIAS_DE_PRUEBA} días de prueba no piden tarjeta. Después pagas la mensualidad de tu plan por transferencia, Nequi o Daviplata. Los recordatorios y los avisos ya están incluidos.`,
  },
  {
    pregunta: '¿Qué pasa con los datos de mis clientes?',
    respuesta: (
      <>
        Cada barbería ve solo sus propios clientes y citas. La primera vez que un cliente escribe recibe un aviso de tratamiento de datos, y si pide que borren sus datos, se borran su nombre, su teléfono y sus conversaciones.{' '}
        <Confirmar>el texto del aviso y la política de datos están pendientes de revisión legal (Ley 1581 de 2012)</Confirmar>
      </>
    ),
  },
];

export default function Inicio() {
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-white">
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-linea bg-papel">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-3 sm:gap-6">
          <a href="#contenido" aria-label="Turnoo, ir al inicio" className="shrink-0">
            {/* En el celular no caben la palabra, Iniciar sesión y Probar: va solo el isotipo. */}
            <Logo className="hidden h-7 sm:block" />
            <img src="/marca/turnoo-isotipo.svg" alt="Turnoo" width={867} height={867} className="size-9 sm:hidden" />
          </a>
          <nav aria-label="Secciones" className="ml-auto hidden items-center gap-1 md:flex">
            {MENU.map((m) => (
              <a key={m.href} href={m.href} className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-marca-suave">
                {m.texto}
              </a>
            ))}
          </nav>
          {/* Iniciar sesión va como enlace, a un lado: el botón principal sigue siendo Probar. */}
          <a href={PANEL} className="ml-auto flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium whitespace-nowrap hover:bg-marca-suave sm:px-3 sm:text-base md:ml-0">
            Iniciar sesión
          </a>
          <BotonDeWhatsapp className="min-h-11 px-3 text-sm whitespace-nowrap max-sm:[&_svg]:hidden sm:px-5 sm:text-base">Probar {DIAS_DE_PRUEBA} días</BotonDeWhatsapp>
        </div>
      </header>

      <main id="contenido">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-16 lg:grid-cols-12 lg:gap-8 lg:pt-20 lg:pb-24">
          <div className="lg:col-span-7">
            <p className="sello text-marca">Para barberías y salones en Colombia</p>
            <h1 className="titular mt-4 text-[2.9rem] sm:text-[4.2rem] lg:text-[5.1rem]">
              Tu barbería agenda sola por <span className="text-marca">WhatsApp</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-suave sm:text-xl">
              Tus clientes escriben como siempre. Un asistente con IA les da turno, les recuerda la cita y te avisa cuando hace falta una persona. Tú ves todo en la agenda.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <BotonDeWhatsapp className="min-h-13 px-6 text-lg">Probar {DIAS_DE_PRUEBA} días</BotonDeWhatsapp>
              <a href="#como-funciona" className="boton min-h-13 bg-hoja px-6 text-lg">
                Ver cómo funciona
                <ArrowDown aria-hidden className="size-5 shrink-0" />
              </a>
            </div>
            <p className="mt-4 text-sm text-suave">Sin tarjeta. Te escribimos por WhatsApp y lo dejamos conectado contigo.</p>
          </div>

          <div className="relative flex justify-center pb-30 lg:col-span-5 lg:justify-end lg:pr-4">
            <ChatDeWhatsapp />
            <Ticket numero="12" className="absolute -bottom-4 -left-1 -rotate-6 drop-shadow-[4px_5px_0_rgb(21_32_43/0.9)] sm:left-10 lg:-left-16">
              <p className="font-semibold">Mañana, 10:00 a. m.</p>
              <p className="text-suave">Corte y barba con Andrés</p>
            </Ticket>
          </div>
        </section>

        <div aria-hidden className="poste" />

        {/* Cómo funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <div className="max-w-2xl">
            <p className="sello text-marca">Cómo funciona</p>
            <h2 className="titular mt-2 text-[2.4rem] sm:text-[3.4rem]">Tres pasos y el turno queda dado.</h2>
          </div>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {PASOS.map((paso, i) => (
              <li key={paso.titulo} className={`border-t-2 border-tinta pt-5 ${i === 1 ? 'md:mt-10' : i === 2 ? 'md:mt-20' : ''}`}>
                <p className="titular text-[3.6rem] text-marca">
                  <span className="align-top text-[1.3rem] tracking-normal">N.º</span> {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="titular mt-2 text-2xl">{paso.titulo}</h3>
                <p className="mt-2 text-lg text-suave">{paso.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Funciones */}
        <section id="funciones" aria-labelledby="funciones-titulo" className="border-t border-linea bg-hoja">
          <div className="mx-auto flex max-w-6xl flex-col gap-20 px-5 py-16 lg:gap-28 lg:py-24">
            <div className="max-w-2xl">
              <p className="sello text-marca">Lo que hace por ti</p>
              <h2 id="funciones-titulo" className="titular mt-2 text-[2.4rem] sm:text-[3.4rem]">
                El WhatsApp atendido. La agenda al día.
              </h2>
            </div>

            <Funcion
              sello="Agenda"
              titulo="Una agenda por barbero, sin citas cruzadas."
              puntos={[
                'Cada barbero tiene sus servicios, sus precios y su horario.',
                'Dos citas no caben en el mismo cupo: el sistema no las deja pasar.',
                'También agendas tú desde el panel, para el cliente que llega o llama.',
                'Cada barbero entra con su usuario y ve solo su agenda.',
              ]}
              imagen={<MarcoDeNavegador src="/capturas/agenda-escritorio.png" alt="Agenda del día en el panel de Turnoo, con una columna por barbero y sus citas" direccion="app.turnooapp.com/agenda" />}
            >
              Lo que el asistente agenda por WhatsApp cae en la misma agenda que ves tú. El día entero, barbero por barbero.
            </Funcion>

            <Funcion
              alReves
              sello="Asistente"
              titulo="Habla de tu barbería y de nada más."
              puntos={[
                'Responde con los servicios, precios y horarios que tú configuraste.',
                'Si no tiene el dato, no lo inventa: le pasa la conversación a una persona.',
                'Mientras tú atiendes a ese cliente, el asistente se queda callado 2 horas.',
              ]}
              imagen={
                <div className="flex justify-center rounded-2xl border border-linea bg-papel px-6 py-10">
                  <MarcoDeCelular src="/capturas/conversacion-celular.png" alt="Conversación en el panel: el asistente no tenía la información y le pasó el cliente a una persona" />
                </div>
              }
            >
              El asistente solo trata temas del negocio. Cuando una pregunta se le sale de las manos, lo dice y te la entrega.
            </Funcion>

            <Funcion
              sello="Recordatorios"
              titulo="Un recordatorio antes de cada cita."
              puntos={[
                'Sale solo, unas horas antes, y nunca de noche.',
                'Si el cliente responde, el asistente le cambia o le cancela la cita.',
                'Incluidos en todos los planes.',
              ]}
              imagen={
                <div className="flex justify-center rounded-2xl border border-linea bg-chat-fondo px-6 py-12">
                  <AvisoDeWhatsapp titulo="Recordatorio de tu cita" hora="9:00 p. m.">
                    <p>Hola, Mateo. Tienes una cita en Barbería La Esquina.</p>
                    <p>
                      <strong>Fecha:</strong> martes 17 de noviembre
                      <br />
                      <strong>Hora:</strong> 10:00 a. m.
                      <br />
                      <strong>Servicio:</strong> Corte y barba
                      <br />
                      <strong>Te atiende:</strong> Andrés
                    </p>
                    <p>Si necesitas cancelar o cambiar la hora, responde a este mensaje.</p>
                  </AvisoDeWhatsapp>
                </div>
              }
            >
              El cliente recibe un mensaje con el día, la hora, el servicio y quién lo atiende. Menos sillas vacías por olvido.
            </Funcion>

            <Funcion
              alReves
              sello="Base de conocimiento"
              titulo="Enséñale lo que siempre te preguntan."
              puntos={['Escribes la pregunta y la respuesta, con tus palabras.', 'El asistente la usa desde ese momento.', 'La editas o la apagas cuando quieras.']}
              imagen={<MarcoDeNavegador src="/capturas/conocimiento-escritorio.png" alt="Base de conocimiento en el panel de Turnoo, con preguntas frecuentes y sus respuestas" direccion="app.turnooapp.com/conocimiento" />}
            >
              Dónde quedan, cómo se paga, si atienden niños. Lo escribes una vez y el asistente lo responde por ti.
            </Funcion>
          </div>
        </section>

        {/* Control del dueño */}
        <section id="control" aria-labelledby="control-titulo" className="bg-marca-oscura text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-12 lg:py-24">
            <div className="lg:col-span-6">
              <p className="sello text-white/80">Tú mandas</p>
              <h2 id="control-titulo" className="titular mt-2 text-[2.4rem] sm:text-[3.4rem]">
                La IA atiende. Tú decides.
              </h2>
              <p className="mt-5 max-w-lg text-lg text-white/85">
                Cuando el asistente le pasa un cliente a una persona, te llega un aviso a tu WhatsApp con el motivo. Abres Mensajes en el panel, lees la conversación y respondes desde ahí.
              </p>
              <ul className="mt-6 flex max-w-lg flex-col gap-2.5 text-white/90">
                {[
                  'Al responder, tomas la conversación y el asistente no se mete.',
                  'Si un cliente falta 3 veces en 30 días, sus próximas citas esperan tu aprobación.',
                  'Te avisamos cuando vas en el 80% de las conversaciones de tu plan.',
                ].map((texto) => (
                  <li key={texto} className="flex gap-2.5">
                    <Check aria-hidden strokeWidth={3} className="mt-1 size-4 shrink-0" />
                    <span>{texto}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative flex justify-center pb-6 lg:col-span-6 lg:justify-end">
              <MarcoDeCelular src="/capturas/mensajes-celular.png" alt="Bandeja de mensajes del panel en el celular, con una conversación que espera respuesta" sombra="shadow-[7px_7px_0_var(--color-acento)]" />
              <div className="absolute bottom-0 left-0 -rotate-2 sm:left-8 lg:left-0">
                <AvisoDeWhatsapp titulo="Un cliente necesita atención" pie="Aviso automático de Turnoo" hora="4:20 p. m.">
                  <p>Un cliente necesita que alguien del negocio le responda.</p>
                  <p>
                    <strong>Cliente:</strong> Carolina
                    <br />
                    <strong>Motivo:</strong> El asistente no tenía esa información
                    <br />
                    <strong>Lo que pidió:</strong> si hacen tintura para hombre
                  </p>
                </AvisoDeWhatsapp>
              </div>
            </div>
          </div>
        </section>

        <div aria-hidden className="poste" />

        {/* Planes */}
        <section id="precios" aria-labelledby="precios-titulo" className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <div className="max-w-2xl">
            <p className="sello text-marca">Precios</p>
            <h2 id="precios-titulo" className="titular mt-2 text-[2.4rem] sm:text-[3.4rem]">
              Un precio al mes, según tu equipo.
            </h2>
            <p className="mt-4 text-lg text-suave">
              En pesos colombianos. Los tres planes traen {DIAS_DE_PRUEBA} días de prueba, citas sin límite y los recordatorios incluidos.
            </p>
          </div>
          <ul className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-end">
            {PLANES.map((plan) => (
              <li
                key={plan.nombre}
                className={`flex flex-col rounded-xl border-2 border-tinta p-5 sm:p-6 ${plan.destacado ? 'bg-marca text-white shadow-[7px_7px_0_var(--color-tinta)] lg:pb-10' : 'bg-hoja'}`}
              >
                <h3 className="titular text-3xl">{plan.nombre}</h3>
                <p className={plan.destacado ? 'text-white/85' : 'text-suave'}>{plan.paraQuien}</p>
                {/* A 320 px "$149.900 al mes" no cabe en una línea: "al mes" baja. */}
                <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="titular text-[3.2rem]">{pesos(plan.precio)}</span>
                  <span className={plan.destacado ? 'text-white/85' : 'text-suave'}>al mes</span>
                </p>
                <ul className={`mt-6 flex flex-col gap-2.5 border-t-2 border-dashed pt-5 ${plan.destacado ? 'border-white/50' : 'border-linea-fuerte'}`}>
                  {[plan.barberos, `${cantidad(plan.conversaciones)} conversaciones de IA al mes`, 'Citas sin límite', 'Recordatorios incluidos'].map((linea) => (
                    <li key={linea} className="flex gap-2.5">
                      <Check aria-hidden strokeWidth={3} className={`mt-1 size-4 shrink-0 ${plan.destacado ? '' : 'text-marca'}`} />
                      <span>{linea}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={enlaceDeWhatsapp(`Hola, quiero probar Turnoo ${DIAS_DE_PRUEBA} días con el plan ${plan.nombre}.`)}
                  target="_blank"
                  rel="noopener"
                  className={`boton mt-7 ${plan.destacado ? 'bg-hoja text-tinta' : 'bg-papel'}`}
                >
                  Probar el plan {plan.nombre}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-3xl text-suave">
            Una conversación de IA es un cliente atendido por el asistente en el mes, sin importar cuántas veces escriba. Si llegas al límite, los clientes que el asistente todavía no ha atendido ese mes pasan directo a ti y los demás siguen con el asistente.
          </p>
        </section>

        {/* Preguntas */}
        <section id="faq" aria-labelledby="faq-titulo" className="border-t border-linea bg-hoja">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-12 lg:py-24">
            <div className="lg:col-span-4">
              <p className="sello text-marca">Preguntas</p>
              <h2 id="faq-titulo" className="titular mt-2 text-[2.4rem] sm:text-[3.4rem]">
                Lo que nos preguntan antes de empezar.
              </h2>
            </div>
            <div className="border-t-2 border-tinta lg:col-span-8">
              {PREGUNTAS.map((p) => (
                <details key={p.pregunta} className="group border-b border-linea-fuerte">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {p.pregunta}
                    <ChevronDown aria-hidden className="size-5 shrink-0 text-marca transition-transform duration-150 group-open:rotate-180" />
                  </summary>
                  <p className="max-w-2xl pb-5 text-lg text-suave">{p.respuesta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <div aria-hidden className="poste" />

        {/* Cierre */}
        <section aria-labelledby="cierre-titulo" className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-8">
            <h2 id="cierre-titulo" className="titular text-[2.9rem] sm:text-[4.4rem]">
              El próximo turno es el de tu barbería.
            </h2>
            <p className="mt-5 max-w-xl text-lg text-suave sm:text-xl">
              Escríbenos por WhatsApp y dejamos Turnoo funcionando contigo. {DIAS_DE_PRUEBA} días de prueba, sin tarjeta.
            </p>
            <BotonDeWhatsapp className="mt-8 min-h-13 px-6 text-lg">Probar {DIAS_DE_PRUEBA} días</BotonDeWhatsapp>
          </div>
          <div className="flex justify-center lg:col-span-4 lg:justify-end">
            <Ticket numero="01" className="rotate-3 drop-shadow-[4px_5px_0_rgb(21_32_43/0.9)]">
              <p className="font-semibold">Tu barbería</p>
              <p className="text-suave">{DIAS_DE_PRUEBA} días de prueba</p>
            </Ticket>
          </div>
        </section>
      </main>

      <footer className="border-t border-linea bg-hoja">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo className="h-6" />
            <p className="mt-2 text-sm text-suave">Agenda por WhatsApp para barberías y salones en Colombia.</p>
          </div>
          <nav aria-label="Enlaces del pie" className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
            {[...MENU, { href: PANEL, texto: 'Entrar al panel' }].map((m) => (
              <a key={m.href} href={m.href} className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-marca-suave">
                {m.texto}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </>
  );
}
