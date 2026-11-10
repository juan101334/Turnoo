import type { Metadata } from 'next';
import { leerSeccion, valoresDeConfiguracion } from '@/lib/ajustes';
import { miNegocio } from '@/lib/datos';
import { SECCIONES } from '@/lib/navegacion';
import { exigirUsuario } from '@/lib/sesion';
import { Ajustes } from './ajustes';

export const metadata: Metadata = { title: SECCIONES.negocio.etiqueta };

/** Zonas horarias que conoce el servidor, con las de América primero (la mayoría de negocios). */
function zonasHorarias(actual: string): string[] {
  const todas = Intl.supportedValuesOf('timeZone');
  const america = todas.filter((z) => z.startsWith('America/'));
  const resto = todas.filter((z) => !z.startsWith('America/'));
  const lista = [...america, ...resto];
  return lista.includes(actual) ? lista : [actual, ...lista];
}

/**
 * Datos del negocio y las reglas que siguen el asistente y la agenda, por secciones (?seccion=).
 * Todo es un solo formulario con una barra para guardar o descartar (ver ajustes.tsx).
 */
export default async function PaginaNegocio({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  await exigirUsuario('negocio');
  const [{ negocio, configuracion }, { seccion }] = await Promise.all([miNegocio(), searchParams]);
  const valores = {
    nombre: negocio.nombre,
    telefonoAvisos: negocio.telefonoAvisos ? `+${negocio.telefonoAvisos}` : '',
    zonaHoraria: negocio.zonaHoraria,
    ...valoresDeConfiguracion(configuracion),
  };
  return <Ajustes valores={valores} zonas={zonasHorarias(negocio.zonaHoraria)} seccionInicial={leerSeccion(seccion)} />;
}
