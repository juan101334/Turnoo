'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useRef, useState } from 'react';
import { Aviso } from '@/componentes/aviso';
import { alEnviarSinReinicio, BotonEnviar, Campo, EnvioSinReinicio, useAvisoAlSalir } from '@/componentes/formulario';
import { crearBloqueo, type EstadoBloqueo } from '../acciones';

const MOTIVOS = ['Almuerzo', 'Permiso', 'Cita médica', 'Vacaciones', 'Festivo'];

export function FormularioBloqueo({ hoy, barberos }: { hoy: string; barberos: { id: string; nombre: string }[] | null }) {
  const [estado, enviar, pendiente] = useActionState<EstadoBloqueo, FormData>(crearBloqueo, {});
  const formulario = useRef<HTMLFormElement>(null);
  const notaSinAviso = useAvisoAlSalir(formulario, pendiente || Boolean(estado.creado));
  const [todoElDia, setTodoElDia] = useState(false);

  if (estado.creado) {
    const { afectadas } = estado.creado;
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="exito">Bloqueo guardado. En esas horas ya no se pueden agendar citas.</Aviso>
        {afectadas.length > 0 && (
          <div className="rounded-xl border border-aviso bg-aviso-suave p-4 text-aviso">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <TriangleAlert aria-hidden className="size-5" />
              {afectadas.length === 1 ? 'Ya había 1 cita a esa hora' : `Ya había ${afectadas.length} citas a esa hora`}
            </p>
            <p className="mb-2 text-sm text-texto">El bloqueo no las cancela. Ábrelas para reprogramarlas o cancelarlas, y avísale al cliente.</p>
            <ul className="flex flex-col gap-1">
              {afectadas.map((c) => (
                <li key={c.id}>
                  <Link href={`/citas/${c.id}`} className="underline underline-offset-2">
                    <span className="first-letter:uppercase">{c.cuando}</span> · {c.cliente}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/bloqueos" className="flex min-h-11 items-center justify-center rounded-lg bg-marca font-semibold text-white hover:bg-marca-oscura">
          Ver bloqueos
        </Link>
      </div>
    );
  }

  return (
    <EnvioSinReinicio pendiente={pendiente}>
    <form ref={formulario} action={enviar} onSubmit={alEnviarSinReinicio(enviar)} className="flex flex-col gap-4">
      {barberos && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profesionalId" className="text-sm font-medium">
            ¿A quién?
          </label>
          <select id="profesionalId" name="profesionalId" required defaultValue="" className="min-h-11 rounded-lg border border-borde bg-superficie px-3 text-base">
            <option value="" disabled>
              Elige…
            </option>
            {barberos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
            <option value="negocio">Todo el negocio (cierre o festivo)</option>
          </select>
        </div>
      )}

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" name="todoElDia" value="si" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} className="size-5 accent-marca" />
        Todo el día
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="fechaDesde" name="fechaDesde" type="date" etiqueta={todoElDia ? 'Desde el día' : 'Día'} defaultValue={hoy} min={hoy} required />
        {todoElDia ? (
          <Campo id="fechaHasta" name="fechaHasta" type="date" etiqueta="Hasta el día" ayuda="Vacío: un solo día." min={hoy} />
        ) : (
          <div />
        )}
        {!todoElDia && (
          <>
            <Campo id="horaDesde" name="horaDesde" type="time" etiqueta="Desde" defaultValue="12:00" required />
            <Campo id="horaHasta" name="horaHasta" type="time" etiqueta="Hasta" defaultValue="13:00" required />
          </>
        )}
      </div>

      <Campo id="motivo" name="motivo" etiqueta="Motivo (opcional)" list="motivos" maxLength={200} autoComplete="off" />
      <datalist id="motivos">
        {MOTIVOS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <BotonEnviar enviando="Guardando…">Guardar bloqueo</BotonEnviar>
      {notaSinAviso}
    </form>
    </EnvioSinReinicio>
  );
}
