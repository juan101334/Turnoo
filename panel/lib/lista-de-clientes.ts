import { telefonoLegible } from './citas';
import type { ClienteDeLista, OrdenClientes } from './datos';

/**
 * Orden de la tabla de clientes, en la URL (?orden=&direccion=). El backend ordena y pagina: aquí
 * solo se valida lo que llega y se arma el enlace de cada encabezado.
 */

export type Direccion = 'asc' | 'desc';
export type ColumnaOrdenable = Exclude<OrdenClientes, 'reciente'>;
export interface Orden {
  orden: ColumnaOrdenable;
  direccion: Direccion;
}

/**
 * Lo primero que se espera al tocar cada columna (igual que el backend): el nombre de la A a la Z,
 * la próxima cita la más cercana, la última visita la más reciente y más citas arriba.
 */
export const DIRECCION_INICIAL: Record<ColumnaOrdenable, Direccion> = {
  nombre: 'asc',
  ultima_visita: 'desc',
  proxima_cita: 'asc',
  total_citas: 'desc',
};

export const ORDEN_POR_DEFECTO: Orden = { orden: 'nombre', direccion: 'asc' };

const esColumna = (v: unknown): v is ColumnaOrdenable => typeof v === 'string' && Object.hasOwn(DIRECCION_INICIAL, v);

/** Lo que venga en la URL; si no sirve, el orden por nombre. Sin dirección, la inicial de la columna. */
export function leerOrden(p: { orden?: string; direccion?: string }): Orden {
  if (!esColumna(p.orden)) return ORDEN_POR_DEFECTO;
  const direccion = p.direccion === 'asc' || p.direccion === 'desc' ? p.direccion : DIRECCION_INICIAL[p.orden];
  return { orden: p.orden, direccion };
}

/** Al tocar un encabezado: la misma columna invierte el orden; otra empieza por su dirección inicial. */
export function siguienteOrden(actual: Orden, columna: ColumnaOrdenable): Orden {
  if (actual.orden === columna) return { orden: columna, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
  return { orden: columna, direccion: DIRECCION_INICIAL[columna] };
}

/** Para aria-sort del encabezado. */
export function ariaSort(actual: Orden, columna: ColumnaOrdenable): 'ascending' | 'descending' | 'none' {
  if (actual.orden !== columna) return 'none';
  return actual.direccion === 'asc' ? 'ascending' : 'descending';
}

/**
 * La URL de la lista con la búsqueda, el orden y la página. El orden por defecto no se escribe:
 * /clientes queda limpio.
 */
export function enlaceDeClientes({ buscar, orden, pagina = 0 }: { buscar: string; orden: Orden; pagina?: number }): string {
  const q = new URLSearchParams();
  if (buscar) q.set('buscar', buscar);
  if (orden.orden !== ORDEN_POR_DEFECTO.orden || orden.direccion !== ORDEN_POR_DEFECTO.direccion) {
    q.set('orden', orden.orden);
    q.set('direccion', orden.direccion);
  }
  if (pagina > 0) q.set('pagina', String(pagina));
  return q.size > 0 ? `/clientes?${q}` : '/clientes';
}

/**
 * Cómo se nombra a cada cliente en la lista. Sin nombre, el teléfono pasa a ser el nombre (es lo
 * que lo identifica) y "Sin nombre" queda debajo.
 */
export function nombreEnLista(c: Pick<ClienteDeLista, 'nombre' | 'telefono' | 'anonimizadoEn'>): { principal: string; detalle: string } {
  const telefono = c.telefono ? telefonoLegible(c.telefono) : null;
  if (c.anonimizadoEn) return { principal: 'Cliente anonimizado', detalle: 'Sin teléfono' };
  if (c.nombre) return { principal: c.nombre, detalle: telefono ?? 'Sin teléfono' };
  if (telefono) return { principal: telefono, detalle: 'Sin nombre' };
  return { principal: 'Sin nombre', detalle: 'Sin teléfono' };
}
