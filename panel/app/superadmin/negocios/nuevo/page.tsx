import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Campo, CampoSeleccion } from '@/componentes/formulario';
import { FormularioConEstado } from '@/componentes/formulario-con-estado';
import { exigirSuperadmin } from '@/lib/sesion-superadmin';
import { crearNegocio } from '../../acciones';

export const metadata: Metadata = { title: 'Nuevo negocio · Superadmin' };

/** Zonas de América primero: casi todos los negocios están en la región. */
function zonasHorarias(): string[] {
  const todas = Intl.supportedValuesOf('timeZone');
  return [...todas.filter((z) => z.startsWith('America/')), ...todas.filter((z) => !z.startsWith('America/'))];
}

/** Crea el negocio en prueba. Después: conectar su WhatsApp e invitar al dueño (en su ficha). */
export default async function PaginaNuevoNegocio() {
  // Como en las demás páginas del superadmin: no depende solo del layout (ver la lista de negocios).
  await exigirSuperadmin();
  return (
    <div className="ancho-formulario">
      <Link href="/superadmin" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-marca">
        <ChevronLeft aria-hidden className="size-5" />
        Negocios
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">Nuevo negocio</h1>
      <p className="mb-4 text-sm text-suave">Empieza en prueba. Después conectas su WhatsApp e invitas al dueño.</p>
      <div className="rounded-xl border border-borde bg-superficie p-4">
        <FormularioConEstado accion={crearNegocio} boton="Crear negocio" enviando="Creando…">
          <Campo id="nombre" name="nombre" etiqueta="Nombre" required maxLength={100} autoComplete="off" ayuda="Así lo nombra el asistente en WhatsApp." />
          <CampoSeleccion id="zonaHoraria" name="zonaHoraria" etiqueta="Zona horaria" defaultValue="America/Bogota">
            {zonasHorarias().map((z) => (
              <option key={z} value={z}>
                {z.replaceAll('_', ' ')}
              </option>
            ))}
          </CampoSeleccion>
          <Campo
            id="telefonoAvisos"
            name="telefonoAvisos"
            etiqueta="WhatsApp del dueño para avisos (opcional)"
            type="tel"
            inputMode="tel"
            maxLength={30}
            autoComplete="off"
            ayuda="El dueño también puede ponerlo después en sus ajustes."
          />
        </FormularioConEstado>
      </div>
    </div>
  );
}
