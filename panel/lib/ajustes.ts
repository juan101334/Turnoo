import { GRUPOS_DE_CONFIGURACION, horaLegible, type Configuracion } from './administracion';

/**
 * Lógica de la pantalla de Ajustes del negocio (app/(panel)/negocio), sin DOM ni backend para
 * probarla sola: las secciones, qué parte guarda cada campo, los resúmenes de la lista del celular,
 * la línea "con esto…" y el aviso al cambiar la zona horaria.
 */

export const SECCIONES_DE_AJUSTES: readonly { id: string; titulo: string }[] = [
  { id: 'datos', titulo: 'Datos del negocio' },
  ...GRUPOS_DE_CONFIGURACION.map((g) => ({ id: g.id, titulo: g.titulo })),
];

/** La sección de ?seccion=, o null si no viene o no existe. */
export function leerSeccion(valor: string | null | undefined): string | null {
  return SECCIONES_DE_AJUSTES.some((s) => s.id === valor) ? (valor as string) : null;
}

/**
 * Ajustes se guarda en dos partes, porque el backend tiene dos rutas: los datos del negocio
 * (PATCH /negocio) y las reglas (PATCH /negocio/configuracion). Si una falla, la otra no se pierde.
 */
export type ParteDeAjustes = 'datos' | 'reglas';
export const CAMPOS_DE_DATOS = ['nombre', 'telefonoAvisos', 'zonaHoraria'] as const;

export function parteDelCampo(nombre: string): ParteDeAjustes {
  return (CAMPOS_DE_DATOS as readonly string[]).includes(nombre) ? 'datos' : 'reglas';
}

/** Las partes que hay que enviar, según los campos que cambiaron (en orden: datos, reglas). */
export function partesConCambios(cambiados: readonly string[]): ParteDeAjustes[] {
  const partes = new Set(cambiados.map(parteDelCampo));
  return (['datos', 'reglas'] as const).filter((p) => partes.has(p));
}

/** En qué sección está un campo (para llevar a la persona al campo con error). */
export function seccionDelCampo(nombre: string): string {
  if (parteDelCampo(nombre) === 'datos') return 'datos';
  return GRUPOS_DE_CONFIGURACION.find((g) => g.campos.some((c) => c.clave === nombre))?.id ?? 'datos';
}

/** Las reglas como quedan en los campos del formulario: números como texto, sin límite = ''. */
export function valoresDeConfiguracion(c: Configuracion): Record<string, string> {
  return Object.fromEntries(Object.entries(c).map(([clave, valor]) => [clave, valor === null ? '' : String(valor)]));
}

/** Resultado de guardar una parte: los valores como quedaron en el backend, o el error. */
export type ResultadoParte = { valores: Record<string, string> } | { error: string };
export type ResultadoAjustes = Partial<Record<ParteDeAjustes, ResultadoParte>>;

const NOMBRE_DE_PARTE: Record<ParteDeAjustes, string> = { datos: 'los datos del negocio', reglas: 'las reglas' };

/**
 * El mensaje después de guardar. Si todo salió, null (basta el aviso breve). Si algo falló, dice
 * qué quedó guardado y qué no, para reintentar solo lo pendiente.
 */
export function mensajeDelResultado(r: ResultadoAjustes): string | null {
  const partes = (['datos', 'reglas'] as const).filter((p) => r[p]);
  const fallidas = partes.filter((p) => 'error' in r[p]!);
  if (fallidas.length === 0) return null;
  const errores = fallidas.map((p) => (r[p] as { error: string }).error).join(' ');
  const guardadas = partes.filter((p) => !fallidas.includes(p));
  if (guardadas.length === 0) return `No se guardó: ${errores}`;
  const guardada = NOMBRE_DE_PARTE[guardadas[0]!];
  const fallida = NOMBRE_DE_PARTE[fallidas[0]!];
  return `Se guardaron ${guardada}, pero no ${fallida}: ${errores}`;
}

// ---------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** 1 → '1 hora', 36 → '36 horas', 48 → '2 días'. */
export function textoDeHoras(horas: number): string {
  if (horas >= 24 && horas % 24 === 0) return plural(horas / 24, 'día', 'días');
  return plural(horas, 'hora', 'horas');
}

/** 45 → '45 min', 60 → '1 hora', 90 → '1 h 30 min', 2880 → '2 días'. */
export function textoDeMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos % 60 === 0) return textoDeHoras(minutos / 60);
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Un entero del campo, o null mientras está vacío o a medio escribir. */
function entero(valor: string | undefined): number | null {
  return valor !== undefined && /^\d{1,7}$/.test(valor.trim()) ? Number(valor.trim()) : null;
}

/** 'America/Bogota' → 'Bogota'; 'America/Argentina/Buenos_Aires' → 'Buenos Aires'. */
export function ciudadDeLaZona(zona: string): string {
  return (zona.split('/').at(-1) ?? zona).replaceAll('_', ' ');
}

/** Lo que se ve de cada sección en la lista del celular, con los valores del formulario. */
export function resumenDeSeccion(id: string, v: Record<string, string>): string {
  const n = (clave: keyof Configuracion) => entero(v[clave]);
  const partes: (string | null)[] = [];
  switch (id) {
    case 'datos':
      partes.push(v.nombre?.trim() || null, v.zonaHoraria ? ciudadDeLaZona(v.zonaHoraria) : null);
      break;
    case 'agenda': {
      const cada = n('intervaloMinutos');
      const dias = n('anticipacionMaxDias');
      partes.push(cada === null ? null : `Cada ${textoDeMinutos(cada)}`, dias === null ? null : `hasta ${plural(dias, 'día', 'días')} adelante`);
      break;
    }
    case 'cancelaciones': {
      const horas = n('horasLimiteCancelacion');
      const faltas = n('maxInasistencias');
      partes.push(horas === null ? null : horas === 0 ? 'Cancela hasta la hora de la cita' : `Cancela hasta ${textoDeHoras(horas)} antes`, faltas === null ? null : plural(faltas, 'inasistencia', 'inasistencias'));
      break;
    }
    case 'recordatorios': {
      const horas = n('horasRecordatorio');
      partes.push(horas === null ? null : `${textoDeHoras(horas)} antes`, v.recordatorioNoAntesDe && v.recordatorioNoDespuesDe ? `de ${horaLegible(v.recordatorioNoAntesDe)} a ${horaLegible(v.recordatorioNoDespuesDe)}` : null);
      break;
    }
    case 'por-aprobar': {
      const horas = n('horasEsperaAprobacion');
      partes.push(horas === null ? null : `${textoDeHoras(horas)} para aprobar`);
      break;
    }
    case 'asistente': {
      const calla = n('horasModoHumano');
      const cierra = n('horasAutocompletarCita');
      partes.push(calla === null ? null : `Pausa de ${textoDeHoras(calla)}`, cierra === null ? null : `cierra citas tras ${textoDeHoras(cierra)}`);
      break;
    }
  }
  return partes.filter(Boolean).join(' · ');
}

/** La línea "Con esto…" de Cancelaciones, o null mientras un número está a medio escribir. */
export function efectoDeCancelaciones(v: Record<string, string>): string | null {
  const horas = entero(v.horasLimiteCancelacion);
  const faltas = entero(v.maxInasistencias);
  const dias = entero(v.ventanaInasistenciasDias);
  if (horas === null || faltas === null || dias === null) return null;
  const hasta = horas === 0 ? 'hasta la hora de la cita' : `hasta ${textoDeHoras(horas)} antes`;
  return `Con esto: el cliente puede cancelar o cambiar su cita por WhatsApp ${hasta}. Si falta a más de ${plural(faltas, 'cita', 'citas')} en ${plural(dias, 'día', 'días')}, el asistente ya no le agenda solo.`;
}

const MINUTOS_DIA = 24 * 60;
/** Igual que el backend (recordatorios.servicio.ts): más cerca de la cita, ya no se envía. */
const MARGEN_MINIMO_MIN = 30;

function minutosDelDia(hhmm: string | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Cuándo sale el recordatorio de una cita que empieza `cita` minutos después de la medianoche del
 * día 0, con la misma regla del backend (tiempo.ts, alHorarioPermitido): `horas` antes, y si cae
 * fuera del horario permitido, al borde más cercano que todavía llegue antes de la cita.
 * Devuelve minutos desde la medianoche del día 0 (negativo = días antes), o null si no sale.
 */
export function momentoDelRecordatorio(cita: number, horas: number, desde: number, hasta: number): number | null {
  const ideal = cita - horas * 60;
  const dia = Math.floor(ideal / MINUTOS_DIA) * MINUTOS_DIA;
  const abre = dia + desde;
  const cierra = dia + hasta;
  const limite = cita - MARGEN_MINIMO_MIN;
  let momento = ideal;
  if (ideal < abre || ideal > cierra) {
    const antes = ideal > cierra ? cierra : dia - MINUTOS_DIA + hasta;
    const despues = ideal > cierra ? dia + MINUTOS_DIA + desde : abre;
    momento = despues < limite && despues - ideal < ideal - antes ? despues : antes;
  }
  return momento < limite ? momento : null;
}

function horaDelMomento(minutos: number): string {
  const delDia = ((minutos % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  return horaLegible(`${String(Math.floor(delDia / 60)).padStart(2, '0')}:${String(delDia % 60).padStart(2, '0')}`);
}

function diaDelMomento(minutos: number): string {
  const dias = -Math.floor(minutos / MINUTOS_DIA);
  if (dias === 0) return 'el mismo día';
  if (dias === 1) return 'el día anterior';
  return `${dias} días antes`;
}

/** La línea "Con esto…" de Recordatorios: dos citas de ejemplo, de la mañana y de la tarde. */
export function efectoDeRecordatorio(v: Record<string, string>): string | null {
  const horas = entero(v.horasRecordatorio);
  const desde = minutosDelDia(v.recordatorioNoAntesDe);
  const hasta = minutosDelDia(v.recordatorioNoDespuesDe);
  if (horas === null || horas < 1 || desde === null || hasta === null || hasta <= desde) return null;
  const ejemplo = (cita: number) => {
    const momento = momentoDelRecordatorio(cita, horas, desde, hasta);
    const cuando = momento === null ? 'no lo recibe (no alcanza a salir a tiempo)' : `lo recibe ${diaDelMomento(momento)} a las ${horaDelMomento(momento)}`;
    return `una cita de las ${horaDelMomento(cita)} ${cuando}`;
  };
  const texto = `Con esto: ${ejemplo(9 * 60)}; ${ejemplo(16 * 60)}`;
  // Si termina en "a. m." o "p. m.", ese punto cierra la frase.
  return texto.endsWith('.') ? texto : `${texto}.`;
}

// ---------------------------------------------------------------------
// Cambio de zona horaria
// ---------------------------------------------------------------------

/** Minutos de diferencia con UTC de la zona en ese instante (Bogotá: -300). */
export function desfaseDeZona(zona: string, instante: Date): number {
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(instante).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Cuántos minutos se corren las horas que se muestran al pasar de una zona a otra (negativo = antes). */
export function corrimientoDeZona(antes: string, despues: string, instante: Date): number {
  return desfaseDeZona(despues, instante) - desfaseDeZona(antes, instante);
}

/**
 * El aviso de la confirmación al cambiar la zona, o null si las dos zonas tienen la misma hora.
 * Las citas no se mueven: es el mismo instante, que se ve a otra hora.
 */
export function avisoDeCambioDeZona(minutos: number): string | null {
  if (minutos === 0) return null;
  const cuanto = textoDeMinutos(Math.abs(minutos)).replace(/^1 hora$/, '1 h').replace(/^(\d+) horas$/, '$1 h');
  const ejemplo = horaDelMomento(10 * 60 + minutos);
  return `Las citas y bloqueos ya agendados no se mueven: se verán ${cuanto} ${minutos < 0 ? 'antes' : 'después'} (la de las 10:00 a. m. pasa a las ${ejemplo}). Los recordatorios y el asistente usarán la hora nueva. El horario de los barberos queda igual.`;
}

export const AVISO_DE_INTERVALO = 'Solo cambia las horas que se ofrecen desde ahora. Las citas ya agendadas no se mueven.';
