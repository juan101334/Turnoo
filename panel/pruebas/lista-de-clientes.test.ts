import { describe, expect, it } from 'vitest';
import { escribioElNombre } from '@/lib/confirmacion';
import { ariaSort, enlaceDeClientes, leerOrden, nombreEnLista, ORDEN_POR_DEFECTO, siguienteOrden } from '@/lib/lista-de-clientes';

describe('orden de la tabla de clientes', () => {
  it('sin orden o con uno que no existe, por nombre de la A a la Z', () => {
    expect(leerOrden({})).toEqual(ORDEN_POR_DEFECTO);
    expect(leerOrden({ orden: 'reciente' })).toEqual(ORDEN_POR_DEFECTO);
    expect(leerOrden({ orden: 'toString' })).toEqual(ORDEN_POR_DEFECTO);
    expect(leerOrden({ orden: 'created_at; drop table', direccion: 'desc' })).toEqual(ORDEN_POR_DEFECTO);
  });

  it('sin dirección, la inicial de la columna; una dirección rara también', () => {
    expect(leerOrden({ orden: 'ultima_visita' })).toEqual({ orden: 'ultima_visita', direccion: 'desc' });
    expect(leerOrden({ orden: 'proxima_cita', direccion: 'arriba' })).toEqual({ orden: 'proxima_cita', direccion: 'asc' });
    expect(leerOrden({ orden: 'total_citas', direccion: 'asc' })).toEqual({ orden: 'total_citas', direccion: 'asc' });
  });

  it('la misma columna invierte; otra empieza por su dirección inicial', () => {
    expect(siguienteOrden(ORDEN_POR_DEFECTO, 'nombre')).toEqual({ orden: 'nombre', direccion: 'desc' });
    expect(siguienteOrden({ orden: 'nombre', direccion: 'desc' }, 'nombre')).toEqual({ orden: 'nombre', direccion: 'asc' });
    expect(siguienteOrden(ORDEN_POR_DEFECTO, 'ultima_visita')).toEqual({ orden: 'ultima_visita', direccion: 'desc' });
    expect(siguienteOrden(ORDEN_POR_DEFECTO, 'proxima_cita')).toEqual({ orden: 'proxima_cita', direccion: 'asc' });
    expect(siguienteOrden({ orden: 'proxima_cita', direccion: 'desc' }, 'total_citas')).toEqual({ orden: 'total_citas', direccion: 'desc' });
  });

  it('aria-sort solo en la columna ordenada', () => {
    expect(ariaSort(ORDEN_POR_DEFECTO, 'nombre')).toBe('ascending');
    expect(ariaSort({ orden: 'total_citas', direccion: 'desc' }, 'total_citas')).toBe('descending');
    expect(ariaSort(ORDEN_POR_DEFECTO, 'total_citas')).toBe('none');
  });

  it('el enlace conserva la búsqueda, omite el orden por defecto y la página 0', () => {
    expect(enlaceDeClientes({ buscar: '', orden: ORDEN_POR_DEFECTO })).toBe('/clientes');
    expect(enlaceDeClientes({ buscar: 'ana', orden: ORDEN_POR_DEFECTO, pagina: 2 })).toBe('/clientes?buscar=ana&pagina=2');
    expect(enlaceDeClientes({ buscar: 'ana', orden: { orden: 'nombre', direccion: 'desc' } })).toBe('/clientes?buscar=ana&orden=nombre&direccion=desc');
    expect(enlaceDeClientes({ buscar: '', orden: { orden: 'total_citas', direccion: 'desc' }, pagina: 1 })).toBe('/clientes?orden=total_citas&direccion=desc&pagina=1');
  });
});

describe('nombre de cada cliente en la lista', () => {
  const base = { nombre: null, telefono: null, anonimizadoEn: null };
  it('con nombre: el nombre y debajo el teléfono', () => {
    expect(nombreEnLista({ ...base, nombre: 'Ana', telefono: '573001112233' })).toEqual({ principal: 'Ana', detalle: '+57 300 111 2233' });
    expect(nombreEnLista({ ...base, nombre: 'Ana' })).toEqual({ principal: 'Ana', detalle: 'Sin teléfono' });
  });

  it('sin nombre: el teléfono pasa a ser el nombre', () => {
    expect(nombreEnLista({ ...base, telefono: '573001112233' })).toEqual({ principal: '+57 300 111 2233', detalle: 'Sin nombre' });
    expect(nombreEnLista(base)).toEqual({ principal: 'Sin nombre', detalle: 'Sin teléfono' });
  });

  it('anonimizado: nunca muestra lo que quede', () => {
    expect(nombreEnLista({ nombre: 'Ana', telefono: '573001112233', anonimizadoEn: '2026-11-01T00:00:00Z' })).toEqual({
      principal: 'Cliente anonimizado',
      detalle: 'Sin teléfono',
    });
  });
});

describe('confirmar escribiendo el nombre del negocio', () => {
  it('exacto, con tildes y mayúsculas; los espacios de los bordes no cuentan', () => {
    expect(escribioElNombre('Barbería La 70', 'Barbería La 70')).toBe(true);
    expect(escribioElNombre('  Barbería La 70 ', 'Barbería La 70')).toBe(true);
    expect(escribioElNombre('barbería la 70', 'Barbería La 70')).toBe(false);
    expect(escribioElNombre('Barberia La 70', 'Barbería La 70')).toBe(false);
    expect(escribioElNombre('Barbería La', 'Barbería La 70')).toBe(false);
  });

  it('vacío nunca confirma', () => {
    expect(escribioElNombre('', '')).toBe(false);
    expect(escribioElNombre('   ', ' ')).toBe(false);
  });
});
