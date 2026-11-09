import type { Metadata } from 'next';
import { Campo, CampoSeleccion } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { GRUPOS_DE_CONFIGURACION, type CampoDeConfiguracion, type Configuracion } from '@/lib/administracion';
import { miNegocio } from '@/lib/datos';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { guardarConfiguracion, guardarDatos } from './acciones';

export const metadata: Metadata = { title: SECCIONES.negocio.etiqueta };

/** Zonas horarias que conoce el servidor, con las de América primero (la mayoría de negocios). */
function zonasHorarias(actual: string): string[] {
  const todas = Intl.supportedValuesOf('timeZone');
  const america = todas.filter((z) => z.startsWith('America/'));
  const resto = todas.filter((z) => !z.startsWith('America/'));
  const lista = [...america, ...resto];
  return lista.includes(actual) ? lista : [actual, ...lista];
}

function CampoDeRegla({ campo, valor }: { campo: CampoDeConfiguracion; valor: Configuracion[keyof Configuracion] }) {
  const id = `regla-${campo.clave}`;
  if (campo.tipo === 'intervalo') {
    return (
      <CampoSeleccion id={id} name={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda} defaultValue={String(valor)}>
        {campo.opciones.map((m) => (
          <option key={m} value={m}>
            {m === 60 ? '1 hora' : `${m} minutos`}
          </option>
        ))}
      </CampoSeleccion>
    );
  }
  if (campo.tipo === 'hora') {
    return <Campo id={id} name={campo.clave} etiqueta={campo.etiqueta} ayuda={campo.ayuda} type="time" required defaultValue={String(valor)} />;
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
      defaultValue={valor === null ? '' : String(valor)}
    />
  );
}

/** Una sección de Ajustes: tarjeta con su título y su propio botón para guardar. */
function Seccion({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-6 rounded-xl border border-borde bg-superficie p-4 lg:p-6">
      <h2 id={id} className="font-semibold">
        {titulo}
      </h2>
      {ayuda && <p className="text-sm text-suave">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Datos del negocio y las reglas que siguen el asistente y la agenda, por secciones. Cada sección
 * se guarda sola (un error en una no frena las demás). En el escritorio, un índice a la izquierda
 * y los campos en dos columnas.
 */
export default async function PaginaNegocio() {
  await exigirUsuario('negocio');
  const { negocio, configuracion } = await miNegocio();
  const indice = [{ id: 'datos', titulo: 'Datos del negocio' }, ...GRUPOS_DE_CONFIGURACION.map((g) => ({ id: g.id, titulo: g.titulo }))];

  return (
    <div className="mx-auto max-w-2xl lg:max-w-5xl">
      <h1 className="mb-1 text-2xl font-semibold">Ajustes del negocio</h1>
      <p className="mb-4 text-sm text-suave">Las reglas las siguen el asistente de WhatsApp y el panel, y se aplican a las citas nuevas.</p>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav aria-label="Secciones de ajustes" className="mb-4 lg:sticky lg:top-6 lg:mb-0">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
            {indice.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-suave hover:bg-hundido hover:text-texto">
                  {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-4">
          <Seccion id="datos" titulo="Datos del negocio">
            <FormularioConEstado accion={guardarDatos} boton="Guardar datos" enviando="Guardando…">
              <div className="grid gap-4 md:grid-cols-2">
                <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} defaultValue={negocio.nombre} autoComplete="organization" ayuda="Así lo nombra el asistente en WhatsApp." />
                <Campo
                  id="telefonoAvisos"
                  name="telefonoAvisos"
                  etiqueta="WhatsApp para avisos"
                  type="tel"
                  inputMode="tel"
                  maxLength={30}
                  defaultValue={negocio.telefonoAvisos ? `+${negocio.telefonoAvisos}` : ''}
                  ayuda="Aquí te llegan los avisos de clientes que piden hablar con una persona y del uso del plan. Vacío: sin avisos."
                  autoComplete="off"
                />
              </div>
              <CampoSeleccion
                id="zonaHoraria"
                name="zonaHoraria"
                etiqueta="Zona horaria"
                defaultValue={negocio.zonaHoraria}
                ayuda={'Define qué es "hoy" y a qué hora se muestran las citas. Cámbiala solo si el negocio está en otro país.'}
              >
                {zonasHorarias(negocio.zonaHoraria).map((z) => (
                  <option key={z} value={z}>
                    {z.replaceAll('_', ' ')}
                  </option>
                ))}
              </CampoSeleccion>
            </FormularioConEstado>
          </Seccion>

          {GRUPOS_DE_CONFIGURACION.map((grupo) => (
            <Seccion key={grupo.id} id={grupo.id} titulo={grupo.titulo}>
              <FormularioConEstado accion={guardarConfiguracion.bind(null, grupo.id)} boton="Guardar cambios" enviando="Guardando…">
                <div className="grid gap-4 md:grid-cols-2">
                  {grupo.campos.map((campo) => (
                    <CampoDeRegla key={campo.clave} campo={campo} valor={configuracion[campo.clave]} />
                  ))}
                </div>
              </FormularioConEstado>
            </Seccion>
          ))}
        </div>
      </div>
    </div>
  );
}
