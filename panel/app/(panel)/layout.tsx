import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProveedorDeAvisos } from '@/componentes/avisos-flotantes';
import { GuardiaDeSalida } from '@/componentes/guardia-de-salida';
import { SaltarAlContenido } from '@/componentes/saltar-al-contenido';
import { Soporte } from '@/componentes/soporte';
import { TituloConPendientes } from '@/componentes/titulo-con-pendientes';
import { MenuLateral, NavInferior } from '@/componentes/navegacion';
import { citasPorAprobar, conversaciones, miNegocio, siSePuede } from '@/lib/datos';
import { gruposDe, pestanasDe, puedeVer, type Contadores } from '@/lib/navegacion';
import { menuPlegado } from '@/lib/menu-servidor';
import { exigirUsuario, type UsuarioDelNegocio } from '@/lib/sesion';
import { temaElegido } from '@/lib/tema-servidor';

/** Lo que falla aquí no tumba el panel: se muestra sin ese dato. */
/**
 * Lo que el marco muestra además del contenido, solo para el dueño: los números junto a "Por
 * aprobar" y "Mensajes", y si la cuenta está suspendida. Para el barbero no hay nada que pedir.
 */
async function datosDelMarco(usuario: UsuarioDelNegocio): Promise<{ contadores: Contadores; suspendido: boolean }> {
  if (usuario.rol !== 'dueno') return { contadores: {}, suspendido: false };
  const [porAprobar, mensajes, negocio] = await Promise.all([
    siSePuede(async () => (await citasPorAprobar()).length),
    siSePuede(async () => (await conversaciones('humano')).length),
    siSePuede(miNegocio),
  ]);
  return { contadores: { porAprobar, mensajes }, suspendido: negocio?.negocio.estado === 'suspendido' };
}

/**
 * Marco del panel con sesión. Cada página vuelve a exigir el usuario con su sección: el layout
 * no se vuelve a pintar al navegar entre páginas, así que no basta con revisarlo aquí.
 */
export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const usuario = await exigirUsuario();
  const [{ contadores, suspendido }, tema, plegado] = await Promise.all([datosDelMarco(usuario), temaElegido(), menuPlegado()]);
  return (
    <ProveedorDeAvisos>
      <GuardiaDeSalida>
        <SaltarAlContenido />
        <div className="flex min-h-dvh">
          <MenuLateral
            grupos={gruposDe(usuario.rol)}
            conCuenta={puedeVer(usuario.rol, 'cuenta')}
            contadores={contadores}
            tema={tema}
            plegadoInicial={plegado}
          />
          <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 outline-none px-4 pt-5 pb-[calc(9rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10 lg:px-10 lg:pt-8">
            <div className="mx-auto w-full max-w-[1440px]">
              {suspendido && (
                <div role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-peligro-suave px-3 py-2.5 text-sm text-peligro">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <strong>La cuenta está suspendida.</strong> Puedes consultar, pero no hacer cambios. Escríbele al <Soporte />.
                  </p>
                </div>
              )}
              {children}
            </div>
          </main>
          <NavInferior pestanas={pestanasDe(usuario.rol)} contadores={contadores} />
          {usuario.rol === 'dueno' && <TituloConPendientes n={contadores.mensajes} />}
        </div>
      </GuardiaDeSalida>
    </ProveedorDeAvisos>
  );
}
