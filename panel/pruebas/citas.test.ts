import { describe, expect, it } from 'vitest';
import { accionesPosibles, historialDelCliente, nombresDeServicios, pesos, telefonoLegible, type EstadoCita } from '@/lib/citas';

const ahora = new Date('2026-11-08T15:00:00Z');
const cita = (estado: EstadoCita, inicio: string, aprobacionExpiraEn: string | null = null) => ({ estado, inicio, aprobacionExpiraEn });

describe('acciones posibles sobre una cita (las mismas reglas del backend)', () => {
  it('antes de empezar: reprogramar o cancelar, pero no marcar', () => {
    expect(accionesPosibles(cita('pendiente', '2026-11-08T16:00:00Z'), ahora)).toEqual(['reprogramar', 'cancelar']);
    expect(accionesPosibles(cita('confirmada', '2026-11-08T16:00:00Z'), ahora)).toEqual(['reprogramar', 'cancelar']);
  });

  it('desde que empieza: también completada y no asistió', () => {
    expect(accionesPosibles(cita('pendiente', '2026-11-08T15:00:00Z'), ahora)).toEqual(['completar', 'noAsistio', 'reprogramar', 'cancelar']);
  });

  it('una cita marcada se puede corregir a la otra marca', () => {
    expect(accionesPosibles(cita('completada', '2026-11-08T14:00:00Z'), ahora)).toEqual(['noAsistio']);
    expect(accionesPosibles(cita('no_asistio', '2026-11-08T14:00:00Z'), ahora)).toEqual(['completar']);
  });

  it('por aprobar: aprobar o rechazar mientras no venza; vencida, nada', () => {
    expect(accionesPosibles(cita('por_aprobar', '2026-11-09T15:00:00Z', '2026-11-08T16:00:00Z'), ahora)).toEqual(['aprobar', 'rechazar']);
    expect(accionesPosibles(cita('por_aprobar', '2026-11-09T15:00:00Z', '2026-11-08T15:00:00Z'), ahora)).toEqual([]);
  });

  it('una cita cancelada no tiene acciones', () => {
    expect(accionesPosibles(cita('cancelada', '2026-11-08T16:00:00Z'), ahora)).toEqual([]);
  });
});

describe('textos de la cita', () => {
  it('pesos colombianos sin decimales', () => {
    expect(pesos(25000)).toBe('$25.000');
    expect(pesos(0)).toBe('$0');
  });

  it('nombres de servicios en una frase', () => {
    expect(nombresDeServicios([{ nombre: 'Corte' }])).toBe('Corte');
    expect(nombresDeServicios([{ nombre: 'Corte' }, { nombre: 'Barba' }])).toBe('Corte y Barba');
    expect(nombresDeServicios([{ nombre: 'Corte' }, { nombre: 'Barba' }, { nombre: 'Cejas' }])).toBe('Corte, Barba y Cejas');
    expect(nombresDeServicios([])).toBe('Sin servicio');
  });

  it('teléfono legible', () => {
    expect(telefonoLegible('573001234567')).toBe('+57 300 123 4567');
    expect(telefonoLegible('14155550100')).toBe('+14155550100');
  });
});

describe('historialDelCliente', () => {
  const h = (clienteCitasCompletadas: number, clienteInasistencias: number) => historialDelCliente({ clienteCitasCompletadas, clienteInasistencias });

  it('sin citas completadas es cliente nuevo, aunque haya faltado', () => {
    expect(h(0, 0)).toEqual({ visitas: 'Cliente nuevo', nuevo: true, inasistencias: null });
    expect(h(0, 2)).toEqual({ visitas: 'Cliente nuevo', nuevo: true, inasistencias: 'No vino 2 veces' });
  });

  it('cuenta las visitas y las faltas en singular y plural', () => {
    expect(h(1, 1)).toEqual({ visitas: 'Ha venido 1 vez', nuevo: false, inasistencias: 'No vino 1 vez' });
    expect(h(12, 0)).toEqual({ visitas: 'Ha venido 12 veces', nuevo: false, inasistencias: null });
  });
});
