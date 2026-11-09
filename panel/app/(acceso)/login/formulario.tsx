'use client';

import { useActionState } from 'react';
import { Aviso } from '@/componentes/aviso';
import { alEnviarSinReinicio, BotonEnviar, Campo, EnvioSinReinicio } from '@/componentes/formulario';
import { iniciarSesion } from '../acciones';

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, {});
  return (
    <EnvioSinReinicio pendiente={pendiente}>
    <form action={accion} onSubmit={alEnviarSinReinicio(accion)} className="flex flex-col gap-4" noValidate>
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <Campo
        id="email"
        name="email"
        type="email"
        etiqueta="Correo"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Campo id="password" name="password" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
      <BotonEnviar enviando="Entrando…">Entrar</BotonEnviar>
    </form>
    </EnvioSinReinicio>
  );
}
