'use client';

import { Power, PowerOff, UserX } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Aviso } from './aviso';
import { useAvisar } from './avisos-flotantes';

const ESTILOS = {
  primario: 'bg-marca text-white hover:bg-marca-oscura',
  secundario: 'border border-borde bg-superficie hover:bg-fondo',
  peligro: 'border border-peligro text-peligro hover:bg-peligro-suave',
} as const;

/** Por nombre: un componente (función) no puede pasar del servidor al navegador como prop. */
const ICONOS = { encender: Power, apagar: PowerOff, quitarUsuario: UserX } as const;

export interface ResultadoDeAccion {
  error?: string;
  listo?: string;
}

/**
 * Un botón que ejecuta una Server Action y muestra su resultado debajo. Con `confirmar`, pide un
 * segundo toque con la pregunta a la vista: para lo que no se deshace con un toque.
 */
export function BotonDeAccion({
  etiqueta,
  enviando,
  icono,
  accion,
  confirmar,
  variante = 'secundario',
}: {
  etiqueta: string;
  enviando: string;
  icono?: keyof typeof ICONOS;
  accion: () => Promise<ResultadoDeAccion | undefined>;
  confirmar?: { pregunta: string; detalle?: string; boton: string };
  variante?: keyof typeof ESTILOS;
}) {
  const Icono = icono ? ICONOS[icono] : undefined;
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDeAccion>({});
  const [pendiente, iniciar] = useTransition();
  const avisar = useAvisar();

  const ejecutar = () =>
    iniciar(async () => {
      const r = (await accion()) ?? {};
      setResultado(r);
      setConfirmando(false);
      if (r.listo) avisar(r.listo);
    });

  return (
    <div className="flex flex-col gap-2">
      {resultado.error && <Aviso tipo="error">{resultado.error}</Aviso>}
      {confirmando && confirmar ? (
        <div className="flex flex-col gap-3 rounded-xl border border-peligro bg-peligro-suave p-3">
          <p className="font-semibold text-peligro">{confirmar.pregunta}</p>
          {confirmar.detalle && <p className="text-sm">{confirmar.detalle}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="min-h-11 cursor-pointer rounded-lg border border-borde bg-superficie font-semibold hover:bg-fondo"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={ejecutar}
              className="min-h-11 cursor-pointer rounded-lg bg-peligro font-semibold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {pendiente ? enviando : confirmar.boton}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setResultado({});
            if (confirmar) setConfirmando(true);
            else ejecutar();
          }}
          className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 disabled:cursor-wait disabled:opacity-70 ${ESTILOS[variante]}`}
        >
          {Icono && <Icono aria-hidden className="size-4" />}
          {pendiente ? enviando : etiqueta}
        </button>
      )}
    </div>
  );
}
