'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Aviso } from '@/componentes/aviso';
import { alEnviarSinReinicio, BotonEnviar, CampoContrasena, EnvioSinReinicio } from '@/componentes/formulario';
import { CLAVE_MIN } from '@/lib/claves';
import type { EstadoFormulario } from './acciones';

type Accion = (previo: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/**
 * Formulario para definir la contraseña desde un enlace de un solo uso (#token=…).
 * El token va en el fragmento, que el navegador no envía al servidor. Al abrir la página se
 * lee y se borra de la barra de direcciones y del historial, para que no quede a la vista.
 */
export function FormularioClaveNueva({ accion, boton }: { accion: Accion; boton: string }) {
  const [estado, enviar, pendiente] = useActionState(accion, {});
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // El efecto puede correr dos veces (React en desarrollo): la segunda ya no encontraría el token
  // en la URL, así que se guarda la primera lectura.
  const leido = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (leido.current === undefined) {
      leido.current = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(null, '', window.location.pathname);
    }
    setToken(leido.current);
  }, []);

  if (token === undefined) return null;
  if (!token) {
    return <Aviso tipo="error">El enlace no es válido o está incompleto. Pide uno nuevo al dueño del negocio.</Aviso>;
  }

  return (
    <EnvioSinReinicio pendiente={pendiente}>
    <form action={enviar} onSubmit={alEnviarSinReinicio(enviar)} className="flex flex-col gap-4" noValidate>
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <input type="hidden" name="token" value={token} />
      <CampoContrasena
        id="password"
        name="password"
        etiqueta="Contraseña nueva"
        ayuda={`Mínimo ${CLAVE_MIN} caracteres.`}
        autoComplete="new-password"
        minLength={CLAVE_MIN}
        required
      />
      <CampoContrasena id="confirmacion" name="confirmacion" etiqueta="Repite la contraseña" autoComplete="new-password" required />
      <BotonEnviar enviando="Guardando…">{boton}</BotonEnviar>
    </form>
    </EnvioSinReinicio>
  );
}
