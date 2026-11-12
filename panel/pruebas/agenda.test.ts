import { describe, expect, it } from 'vitest';
import {
  desdeAhora,
  diaDeLaSemana,
  duracionLegible,
  horaElegida,
  horasLibres,
  horaTapada,
  marcaEn,
  marcasDelHueco,
  resumenDelDia,
  sinTurno,
  huecosLibres,
  minutosDesdeElInicio,
  quienSigue,
  rangoDeLaGrilla,
  rangosDeTrabajo,
  restar,
  tramoDe,
} from '@/lib/agenda';

const BOGOTA = 'America/Bogota';
// Lunes 9 de noviembre de 2026; en Bogotá es UTC-5.
const FECHA = '2026-11-09';
const a = (hora: string) => `${FECHA}T${hora}:00-05:00`;

describe('minutos del día en la zona del negocio', () => {
  it('cuenta desde las 00:00 locales, no desde las de UTC', () => {
    expect(minutosDesdeElInicio(a('10:30'), FECHA, BOGOTA)).toBe(630);
    expect(minutosDesdeElInicio('2026-11-09T15:30:00Z', FECHA, BOGOTA)).toBe(630);
  });

  it('un bloqueo de varios días se recorta al día', () => {
    expect(tramoDe({ inicio: '2026-11-08T12:00:00-05:00', fin: '2026-11-10T12:00:00-05:00' }, FECHA, BOGOTA)).toEqual({ inicio: 0, fin: 1440 });
    expect(tramoDe({ inicio: '2026-11-08T08:00:00-05:00', fin: '2026-11-08T09:00:00-05:00' }, FECHA, BOGOTA)).toBeNull();
  });
});

describe('horario y huecos', () => {
  const horarios = [
    { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
    { diaSemana: 1, horaInicio: '08:00:00', horaFin: '12:00:00' },
    { diaSemana: 2, horaInicio: '08:00', horaFin: '20:00' },
  ];

  it('toma solo los rangos de ese día de la semana, en orden (1 = lunes)', () => {
    expect(diaDeLaSemana(FECHA)).toBe(1);
    expect(rangosDeTrabajo(horarios, FECHA)).toEqual([
      { inicio: 480, fin: 720 },
      { inicio: 840, fin: 1080 },
    ]);
  });

  it('restar parte un tramo en dos y quita lo que tapa entero', () => {
    expect(restar([{ inicio: 0, fin: 100 }], [{ inicio: 20, fin: 30 }, { inicio: 90, fin: 120 }])).toEqual([
      { inicio: 0, fin: 20 },
      { inicio: 30, fin: 90 },
    ]);
    expect(restar([{ inicio: 10, fin: 20 }], [{ inicio: 0, fin: 30 }])).toEqual([]);
  });

  it('los huecos descuentan citas activas y bloqueos, pero no las canceladas', () => {
    const huecos = huecosLibres({
      trabajo: rangosDeTrabajo(horarios, FECHA),
      citas: [
        { inicio: a('09:00'), fin: a('09:50'), estado: 'pendiente' },
        { inicio: a('10:00'), fin: a('10:30'), estado: 'cancelada' },
        { inicio: a('11:50'), fin: a('12:00'), estado: 'completada' },
      ],
      bloqueos: [{ inicio: a('15:00'), fin: a('16:00') }],
      fecha: FECHA,
      zona: BOGOTA,
    });
    expect(huecos).toEqual([
      { inicio: 480, fin: 540 },
      { inicio: 590, fin: 710 },
      { inicio: 840, fin: 900 },
      { inicio: 960, fin: 1080 },
    ]);
  });

  it('hoy no ofrece lo que ya pasó, y un hueco de menos de 15 minutos no cuenta', () => {
    const desde = desdeAhora(FECHA, BOGOTA, new Date(a('11:46')));
    expect(desde).toBe(710);
    expect(huecosLibres({ trabajo: [{ inicio: 480, fin: 720 }], citas: [], bloqueos: [], fecha: FECHA, zona: BOGOTA, desde })).toEqual([]);
    expect(huecosLibres({ trabajo: [{ inicio: 480, fin: 720 }], citas: [], bloqueos: [], fecha: FECHA, zona: BOGOTA, desde: 700 })).toEqual([{ inicio: 700, fin: 720 }]);
  });
});

describe('grilla del escritorio', () => {
  it('va de la primera a la última hora con algo, en horas enteras', () => {
    expect(rangoDeLaGrilla([{ inicio: 490, fin: 720 }, { inicio: 840, fin: 1075 }])).toEqual({ inicio: 480, fin: 1080 });
  });

  it('sin nada que mostrar, de 8:00 a 18:00', () => {
    expect(rangoDeLaGrilla([])).toEqual({ inicio: 480, fin: 1080 });
  });

  it('la etiqueta de la hora se esconde solo si la de "ahora" cae encima', () => {
    // 12:04 tapa "12 p. m."; 12:15 ya no (15 min = 20 px).
    expect(horaTapada(720, 724)).toBe(true);
    expect(horaTapada(720, 706)).toBe(true);
    expect(horaTapada(720, 735)).toBe(false);
    expect(horaTapada(720, 705)).toBe(false);
    expect(horaTapada(720, undefined)).toBe(false);
  });

  it('sin turno: ni horario ni citas ese día', () => {
    expect(sinTurno({ trabajo: [], citas: [] })).toBe(true);
    expect(sinTurno({ trabajo: [{ inicio: 480, fin: 720 }], citas: [] })).toBe(false);
    // Una cita fuera de horario lo deja a la vista: hay algo que atender.
    expect(sinTurno({ trabajo: [], citas: [{}] })).toBe(false);
  });

  it('el resumen cuenta las citas sin las canceladas, las completadas y las por aprobar', () => {
    const estados = ['pendiente', 'confirmada', 'completada', 'completada', 'no_asistio', 'cancelada', 'por_aprobar'] as const;
    expect(resumenDelDia(estados.map((estado) => ({ estado })))).toEqual({ citas: 6, completadas: 2, porAprobar: 1 });
    expect(resumenDelDia([])).toEqual({ citas: 0, completadas: 0, porAprobar: 0 });
  });
});

describe('quién sigue', () => {
  const citas = [
    { id: 'pasada', inicio: a('08:00'), fin: a('08:30'), estado: 'pendiente' as const },
    { id: 'cancelada', inicio: a('09:00'), fin: a('09:30'), estado: 'cancelada' as const },
    { id: 'en-curso', inicio: a('09:10'), fin: a('09:40'), estado: 'confirmada' as const },
    { id: 'despues', inicio: a('10:00'), fin: a('10:30'), estado: 'pendiente' as const },
    { id: 'completada', inicio: a('10:30'), fin: a('11:00'), estado: 'completada' as const },
  ];

  it('la que está pasando gana sobre la siguiente', () => {
    expect(quienSigue(citas, new Date(a('09:20')))).toMatchObject({ cita: { id: 'en-curso' }, enCurso: true });
  });

  it('si ninguna está pasando, la próxima pendiente o confirmada', () => {
    expect(quienSigue(citas, new Date(a('09:45')))).toMatchObject({ cita: { id: 'despues' }, enCurso: false });
  });

  it('sin nada por atender, nadie', () => {
    expect(quienSigue(citas, new Date(a('10:31')))).toBeNull();
  });
});

describe('duración legible', () => {
  it('minutos, horas y mezcla', () => {
    expect(duracionLegible(50)).toBe('50 min');
    expect(duracionLegible(60)).toBe('1 h');
    expect(duracionLegible(80)).toBe('1 h 20 min');
  });
});

describe('horas libres para elegir', () => {
  const huecos = [{ inicio: a('09:30') }, { inicio: a('12:00') }, { inicio: a('17:30') }, { inicio: a('18:00') }];

  it('se agrupan en mañana, tarde y noche, con la hora en la zona del negocio', () => {
    const horas = horasLibres(huecos, BOGOTA);
    expect(horas.map((h) => h.franja)).toEqual(['Mañana', 'Tarde', 'Tarde', 'Noche']);
    expect(horas[0]!.etiqueta).toMatch(/^9:30\sa\.\s?m\.$/);
  });

  it('desde un hueco se marca esa hora, o la primera libre después', () => {
    expect(horaElegida(huecos, a('12:00'))).toBe(a('12:00'));
    expect(horaElegida(huecos, a('12:10'))).toBe(a('17:30'));
    expect(horaElegida(huecos, a('19:00'))).toBeUndefined();
    expect(horaElegida(huecos, 'no-es-una-hora')).toBeUndefined();
    expect(horaElegida(huecos, undefined)).toBeUndefined();
  });
});

describe('clic en un hueco de la grilla', () => {
  it('las marcas empiezan en el hueco y siguen el reloj cada intervalo', () => {
    expect(marcasDelHueco({ inicio: 570, fin: 660 }, 15)).toEqual([570, 585, 600, 615, 630, 645]); // 9:30–11:00
    // Un hueco que empieza desalineado (una cita terminó a las 9:40): 9:40, luego 9:45, 10:00…
    expect(marcasDelHueco({ inicio: 580, fin: 630 }, 15)).toEqual([580, 585, 600, 615]);
    expect(marcasDelHueco({ inicio: 600, fin: 720 }, 60)).toEqual([600, 660]);
    expect(marcasDelHueco({ inicio: 600, fin: 610 }, 30)).toEqual([600]);
  });

  it('el minuto del mouse cae en la franja que empieza en él o antes', () => {
    const marcas = [570, 585, 600, 615];
    expect(marcaEn(marcas, 570)).toBe(0);
    expect(marcaEn(marcas, 599.9)).toBe(1);
    expect(marcaEn(marcas, 600)).toBe(2);
    expect(marcaEn(marcas, 700)).toBe(3);
    expect(marcaEn(marcas, 500)).toBe(0);
  });
});
