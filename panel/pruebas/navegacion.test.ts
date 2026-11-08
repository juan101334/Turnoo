import { describe, expect, it } from 'vitest';
import { lateralDe, pestanasDe, puedeVer, rutaDeInicio, SECCIONES, SECCIONES_DE_MAS, type ClaveSeccion } from '@/lib/navegacion';

const SOLO_DUENO: ClaveSeccion[] = ['porAprobar', 'mensajes', 'equipo', 'usuarios', 'conocimiento', 'plan', 'negocio', 'mas'];

describe('navegación por rol', () => {
  it('el barbero tiene cinco pestañas y ninguna del dueño', () => {
    const pestanas = pestanasDe('empleado');
    expect(pestanas).toEqual(['hoy', 'agenda', 'bloqueos', 'clientes', 'cuenta']);
    for (const clave of SOLO_DUENO) {
      expect(puedeVer('empleado', clave)).toBe(false);
      expect(lateralDe('empleado')).not.toContain(clave);
    }
  });

  it('el dueño tiene cinco pestañas, y en "Más" y en la lateral todo lo demás', () => {
    expect(pestanasDe('dueno')).toEqual(['hoy', 'agenda', 'porAprobar', 'mensajes', 'mas']);
    for (const clave of Object.keys(SECCIONES) as ClaveSeccion[]) expect(puedeVer('dueno', clave)).toBe(true);
    const alcanzables = new Set([...pestanasDe('dueno'), ...SECCIONES_DE_MAS]);
    for (const clave of lateralDe('dueno')) expect(alcanzables.has(clave)).toBe(true);
  });

  it('nunca más de cinco pestañas en el celular', () => {
    expect(pestanasDe('dueno').length).toBeLessThanOrEqual(5);
    expect(pestanasDe('empleado').length).toBeLessThanOrEqual(5);
  });

  it('el superadmin no tiene secciones del negocio y entra a su aviso', () => {
    expect(pestanasDe('superadmin')).toEqual([]);
    expect(lateralDe('superadmin')).toEqual([]);
    expect(rutaDeInicio('superadmin')).toBe('/superadmin');
    expect(rutaDeInicio('empleado')).toBe('/hoy');
  });
});
