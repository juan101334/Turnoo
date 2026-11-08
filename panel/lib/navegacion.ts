/**
 * Secciones del panel y quién puede verlas. El panel solo OCULTA lo que no corresponde: quien
 * decide los permisos es el backend, que responde 403 o 404 aunque alguien escriba la ruta a mano.
 */

export type Rol = 'superadmin' | 'dueno' | 'empleado';

export type ClaveSeccion =
  | 'hoy'
  | 'agenda'
  | 'porAprobar'
  | 'mensajes'
  | 'bloqueos'
  | 'clientes'
  | 'equipo'
  | 'usuarios'
  | 'conocimiento'
  | 'plan'
  | 'negocio'
  | 'cuenta'
  | 'mas';

export interface Seccion {
  ruta: string;
  etiqueta: string;
  roles: readonly Rol[];
}

const AMBOS = ['dueno', 'empleado'] as const;
const DUENO = ['dueno'] as const;

export const SECCIONES: Record<ClaveSeccion, Seccion> = {
  hoy: { ruta: '/hoy', etiqueta: 'Hoy', roles: AMBOS },
  agenda: { ruta: '/agenda', etiqueta: 'Agenda', roles: AMBOS },
  porAprobar: { ruta: '/por-aprobar', etiqueta: 'Por aprobar', roles: DUENO },
  mensajes: { ruta: '/mensajes', etiqueta: 'Mensajes', roles: DUENO },
  bloqueos: { ruta: '/bloqueos', etiqueta: 'Bloqueos', roles: AMBOS },
  clientes: { ruta: '/clientes', etiqueta: 'Clientes', roles: AMBOS },
  equipo: { ruta: '/equipo', etiqueta: 'Barberos y servicios', roles: DUENO },
  usuarios: { ruta: '/usuarios', etiqueta: 'Usuarios', roles: DUENO },
  conocimiento: { ruta: '/conocimiento', etiqueta: 'Base de conocimiento', roles: DUENO },
  plan: { ruta: '/plan', etiqueta: 'Plan', roles: DUENO },
  negocio: { ruta: '/negocio', etiqueta: 'Ajustes del negocio', roles: DUENO },
  cuenta: { ruta: '/cuenta', etiqueta: 'Cuenta', roles: AMBOS },
  mas: { ruta: '/mas', etiqueta: 'Más', roles: DUENO },
};

/** Barra inferior del celular: cinco pestañas como máximo, al alcance del pulgar. */
const PESTANAS: Record<Exclude<Rol, 'superadmin'>, ClaveSeccion[]> = {
  empleado: ['hoy', 'agenda', 'bloqueos', 'clientes', 'cuenta'],
  dueno: ['hoy', 'agenda', 'porAprobar', 'mensajes', 'mas'],
};

/** Lo que el dueño encuentra en "Más" (en el celular). */
export const SECCIONES_DE_MAS: ClaveSeccion[] = ['bloqueos', 'clientes', 'equipo', 'usuarios', 'conocimiento', 'plan', 'negocio', 'cuenta'];

/** Barra lateral del escritorio: todo lo que el rol puede ver, menos "Más". */
const LATERAL: ClaveSeccion[] = ['hoy', 'agenda', 'porAprobar', 'mensajes', 'bloqueos', 'clientes', 'equipo', 'usuarios', 'conocimiento', 'plan', 'negocio', 'cuenta'];

export function puedeVer(rol: Rol, clave: ClaveSeccion): boolean {
  return SECCIONES[clave].roles.includes(rol);
}

export function pestanasDe(rol: Rol): ClaveSeccion[] {
  return rol === 'superadmin' ? [] : PESTANAS[rol];
}

export function lateralDe(rol: Rol): ClaveSeccion[] {
  return LATERAL.filter((clave) => puedeVer(rol, clave));
}

/** Adónde va cada rol al entrar. El superadmin no tiene panel en la versión 1. */
export function rutaDeInicio(rol: Rol): string {
  return rol === 'superadmin' ? '/superadmin' : SECCIONES.hoy.ruta;
}
