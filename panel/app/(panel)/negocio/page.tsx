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

/** Datos del negocio y las reglas que siguen el asistente y la agenda. */
export default async function PaginaNegocio() {
  await exigirUsuario('negocio');
  const { negocio, configuracion } = await miNegocio();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Ajustes del negocio</h1>

      <section aria-labelledby="datos" className="mb-4 rounded-2xl border border-borde bg-superficie p-4">
        <h2 id="datos" className="mb-3 font-semibold">
          Datos del negocio
        </h2>
        <FormularioConEstado accion={guardarDatos} boton="Guardar datos" enviando="Guardando…">
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
      </section>

      <section aria-labelledby="reglas" className="rounded-2xl border border-borde bg-superficie p-4">
        <h2 id="reglas" className="font-semibold">
          Reglas de la agenda
        </h2>
        <p className="mb-3 text-sm text-suave">Las siguen el asistente de WhatsApp y el panel. Se aplican a las citas nuevas.</p>
        <FormularioConEstado accion={guardarConfiguracion} boton="Guardar reglas" enviando="Guardando…">
          {GRUPOS_DE_CONFIGURACION.map((grupo) => (
            <fieldset key={grupo.titulo} className="flex flex-col gap-4">
              <legend className="mb-3 font-semibold text-marca-oscura">{grupo.titulo}</legend>
              {grupo.campos.map((campo) => (
                <CampoDeRegla key={campo.clave} campo={campo} valor={configuracion[campo.clave]} />
              ))}
            </fieldset>
          ))}
        </FormularioConEstado>
      </section>
    </div>
  );
}
