import { DateTime } from 'luxon';

/** Uso del mes frente al plan (GET /negocio/uso) y estado de la cuenta del negocio (GET /negocio). */

export interface UsoDelMes {
  /** Primer día del mes en la zona del negocio (AAAA-MM-DD). */
  periodo: string;
  /** null: el negocio no tiene plan asignado (sin límites). */
  plan: { nombre: string; maxConversacionesIa: number | null; maxCitasMes: number | null } | null;
  uso: { conversacionesIa: number; citasCreadas: number; plantillasEnviadas: number };
}

export type EstadoNegocio = 'prueba' | 'activo' | 'suspendido';

/** Desde aquí se avisa: es el mismo 80% con el que el backend le escribe al dueño por WhatsApp. */
export const UMBRAL_AVISO = 80;

export interface Medidor {
  usado: number;
  /** null: sin límite. */
  limite: number | null;
  /** 0 a 100 (null sin límite). Hacia abajo: 99,6% no se muestra como lleno. */
  porcentaje: number | null;
  nivel: 'normal' | 'alto' | 'lleno';
}

export function medidor(usado: number, limite: number | null): Medidor {
  if (limite === null || limite <= 0) return { usado, limite: null, porcentaje: null, nivel: 'normal' };
  const porcentaje = Math.min(100, Math.floor((usado / limite) * 100));
  const nivel = usado >= limite ? 'lleno' : porcentaje >= UMBRAL_AVISO ? 'alto' : 'normal';
  return { usado, limite, porcentaje, nivel };
}

/** 'noviembre de 2026'. */
export function nombreDelMes(periodo: string): string {
  return DateTime.fromISO(periodo).setLocale('es-CO').toFormat("LLLL 'de' yyyy");
}

/** El primer día del mes siguiente: cuando los contadores vuelven a cero ('1 de diciembre'). */
export function reinicioDelMes(periodo: string): string {
  return DateTime.fromISO(periodo).plus({ months: 1 }).setLocale('es-CO').toFormat("d 'de' LLLL");
}
