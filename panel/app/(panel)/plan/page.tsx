import type { Metadata } from 'next';
import { Aviso } from '@/componentes/aviso';
import { miNegocio, usoDelMes } from '@/lib/datos';
import { fechaDe, fechaLarga } from '@/lib/fechas';
import { SECCIONES } from '@/lib/navegacion';
import { medidor, nombreDelMes, reinicioDelMes, type Medidor } from '@/lib/plan';
import { exigirUsuario } from '@/lib/sesion';

export const metadata: Metadata = { title: SECCIONES.plan.etiqueta };

const COLORES: Record<Medidor['nivel'], string> = { normal: 'bg-marca', alto: 'bg-aviso', lleno: 'bg-peligro' };

function Uso({ titulo, explicacion, alLlenarse, m }: { titulo: string; explicacion: string; alLlenarse: string; m: Medidor }) {
  return (
    <section aria-label={titulo} className="rounded-xl border border-borde bg-superficie p-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="text-lg font-semibold">{m.usado.toLocaleString('es-CO')}</span>
          <span className="text-suave">{m.limite === null ? ' · sin límite' : ` de ${m.limite.toLocaleString('es-CO')}`}</span>
        </p>
      </div>
      {m.porcentaje !== null && (
        <div
          role="progressbar"
          aria-label={`${titulo}: uso del mes`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={m.porcentaje}
          className="mb-2 h-2.5 overflow-hidden rounded-full bg-fondo ring-1 ring-borde"
        >
          <div className={`h-full rounded-full ${COLORES[m.nivel]}`} style={{ width: `${m.porcentaje}%` }} />
        </div>
      )}
      <p className="text-sm text-suave">{explicacion}</p>
      {m.nivel === 'lleno' && (
        <p className="mt-2 text-sm font-semibold text-peligro">Llegaste al límite. {alLlenarse}</p>
      )}
      {m.nivel === 'alto' && <p className="mt-2 text-sm font-semibold text-aviso">Vas en el {m.porcentaje}% del mes.</p>}
    </section>
  );
}

/** Cuánto del plan va usado este mes y qué pasa al llegar al límite. Cambiar de plan lo hace el soporte. */
export default async function PaginaPlan() {
  const usuario = await exigirUsuario('plan');
  const zona = usuario.negocio.zonaHoraria;
  const [{ periodo, plan, uso }, { negocio }] = await Promise.all([usoDelMes(), miNegocio()]);
  const fecha = (iso: string) => fechaLarga(fechaDe(iso, zona));

  const estado =
    negocio.estado === 'suspendido'
      ? { tipo: 'error' as const, texto: 'La cuenta está suspendida: puedes consultar, pero no hacer cambios. Escríbele al soporte de Turnoo.' }
      : negocio.estado === 'prueba'
        ? { tipo: 'info' as const, texto: negocio.pruebaHasta ? `Periodo de prueba hasta el ${fecha(negocio.pruebaHasta)}.` : 'Periodo de prueba.' }
        : { tipo: 'exito' as const, texto: negocio.pagadoHasta ? `Cuenta activa, pagada hasta el ${fecha(negocio.pagadoHasta)}.` : 'Cuenta activa.' };

  return (
    <div className="ancho-lista">
      <h1 className="text-2xl font-semibold">{plan ? `Plan ${plan.nombre}` : 'Plan'}</h1>
      <p className="mb-4 text-sm text-suave first-letter:uppercase">
        Uso de {nombreDelMes(periodo)}. Los contadores vuelven a cero el {reinicioDelMes(periodo)}.
      </p>
      <div className="mb-4">
        <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>
      </div>
      {!plan && (
        <div className="mb-4">
          <Aviso tipo="info">El negocio todavía no tiene un plan asignado, así que no hay límites.</Aviso>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Uso
          titulo="Conversaciones con el asistente"
          explicacion="Cada cliente que el asistente atiende cuenta una vez en el mes, aunque escriba muchas veces."
          alLlenarse="Los clientes que escriban por primera vez este mes pasan directo a ti, en Mensajes. Los que ya venía atendiendo siguen con el asistente."
          m={medidor(uso.conversacionesIa, plan?.maxConversacionesIa ?? null)}
        />
        <Uso
          titulo="Citas creadas"
          explicacion="Todas las citas nuevas del mes: por WhatsApp y desde el panel."
          alLlenarse="No se pueden crear más citas hasta el próximo mes, ni por WhatsApp ni desde el panel."
          m={medidor(uso.citasCreadas, plan?.maxCitasMes ?? null)}
        />
        <Uso
          titulo="Mensajes automáticos"
          explicacion="Recordatorios de cita y avisos que te llegan a ti. WhatsApp los cobra aparte; no tienen límite en el plan."
          alLlenarse=""
          m={medidor(uso.plantillasEnviadas, null)}
        />
      </div>
      <p className="mt-4 text-sm text-suave">Para cambiar de plan, escríbele al soporte de Turnoo.</p>
    </div>
  );
}
