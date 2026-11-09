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

/** Número a mostrar junto a una sección (0 o ausente: no se muestra). */
export type Contadores = Partial<Record<ClaveSeccion, number>>;

/** '9+' a partir de 10: el número exacto está en la página. */
export function textoDelContador(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n > 9 ? '9+' : String(n);
}

export interface Seccion {
  ruta: string;
  etiqueta: string;
  /** Para el menú angosto de la tablet, donde caben unas 10 letras. */
  corta?: string;
  roles: readonly Rol[];
}

const AMBOS = ['dueno', 'empleado'] as const;
const DUENO = ['dueno'] as const;

export const SECCIONES: Record<ClaveSeccion, Seccion> = {
  hoy: { ruta: '/hoy', etiqueta: 'Hoy', roles: AMBOS },
  agenda: { ruta: '/agenda', etiqueta: 'Agenda', roles: AMBOS },
  porAprobar: { ruta: '/por-aprobar', etiqueta: 'Por aprobar', corta: 'Aprobar', roles: DUENO },
  mensajes: { ruta: '/mensajes', etiqueta: 'Mensajes', roles: DUENO },
  bloqueos: { ruta: '/bloqueos', etiqueta: 'Bloqueos', roles: AMBOS },
  clientes: { ruta: '/clientes', etiqueta: 'Clientes', roles: AMBOS },
  equipo: { ruta: '/equipo', etiqueta: 'Barberos y servicios', corta: 'Equipo', roles: DUENO },
  usuarios: { ruta: '/usuarios', etiqueta: 'Usuarios', roles: DUENO },
  conocimiento: { ruta: '/conocimiento', etiqueta: 'Base de conocimiento', corta: 'Asistente', roles: DUENO },
  plan: { ruta: '/plan', etiqueta: 'Plan', roles: DUENO },
  negocio: { ruta: '/negocio', etiqueta: 'Ajustes del negocio', corta: 'Ajustes', roles: DUENO },
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

export interface Grupo {
  titulo: string;
  secciones: ClaveSeccion[];
}

/**
 * Menú lateral (tablet y escritorio) agrupado por para qué se usa: lo de todos los días arriba,
 * la configuración abajo. "Cuenta" va aparte, al pie.
 */
const GRUPOS: Grupo[] = [
  { titulo: 'Día a día', secciones: ['hoy', 'agenda', 'porAprobar', 'mensajes'] },
  { titulo: 'Clientes y equipo', secciones: ['clientes', 'bloqueos', 'equipo', 'usuarios'] },
  { titulo: 'Negocio', secciones: ['conocimiento', 'negocio', 'plan'] },
];

/** Los grupos con solo lo que el rol puede ver; un grupo vacío no aparece. */
export function gruposDe(rol: Rol): Grupo[] {
  return GRUPOS.map((g) => ({ ...g, secciones: g.secciones.filter((c) => puedeVer(rol, c)) })).filter((g) => g.secciones.length > 0);
}

/** "Más" en el celular: los mismos grupos, sin lo que ya está en la barra inferior. */
export function gruposDeMas(rol: Rol): Grupo[] {
  if (rol === 'superadmin') return [];
  const enLaBarra = new Set(PESTANAS[rol]);
  return [...gruposDe(rol), { titulo: 'Cuenta', secciones: ['cuenta' as ClaveSeccion] }]
    .map((g) => ({ ...g, secciones: g.secciones.filter((c) => !enLaBarra.has(c) && puedeVer(rol, c)) }))
    .filter((g) => g.secciones.length > 0);
}

/** Todo lo que el rol puede ver en el menú lateral, en orden (para pruebas y accesos). */
export function lateralDe(rol: Rol): ClaveSeccion[] {
  return [...gruposDe(rol).flatMap((g) => g.secciones), ...(puedeVer(rol, 'cuenta') ? (['cuenta'] as ClaveSeccion[]) : [])];
}

export function puedeVer(rol: Rol, clave: ClaveSeccion): boolean {
  return SECCIONES[clave].roles.includes(rol);
}

export function pestanasDe(rol: Rol): ClaveSeccion[] {
  return rol === 'superadmin' ? [] : PESTANAS[rol];
}


/** Adónde va cada rol al entrar. El superadmin no tiene panel en la versión 1. */
export function rutaDeInicio(rol: Rol): string {
  return rol === 'superadmin' ? '/superadmin' : SECCIONES.hoy.ruta;
}
