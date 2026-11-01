/**
 * Errores del negocio. Cada uno lleva un código estable, un mensaje legible
 * y el estado HTTP con el que se responde. La IA también recibe estos mensajes
 * como resultado de sus funciones, para poder explicárselos al cliente.
 */
export class ErrorDominio extends Error {
  readonly codigo: string;
  readonly estadoHttp: number;

  constructor(codigo: string, mensaje: string, estadoHttp = 400) {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
  }
}

export class DatosInvalidos extends ErrorDominio {
  constructor(mensaje = 'Los datos enviados no son válidos') {
    super('DATOS_INVALIDOS', mensaje, 400);
  }
}

export class NoAutorizado extends ErrorDominio {
  constructor(mensaje = 'Debes iniciar sesión') {
    super('NO_AUTORIZADO', mensaje, 401);
  }
}

export class Prohibido extends ErrorDominio {
  constructor(mensaje = 'No tienes permiso para hacer esto') {
    super('PROHIBIDO', mensaje, 403);
  }
}

export class NoEncontrado extends ErrorDominio {
  constructor(que = 'El recurso') {
    super('NO_ENCONTRADO', `${que} no existe`, 404);
  }
}

export class Duplicado extends ErrorDominio {
  constructor(mensaje = 'Ya existe un registro con esos datos') {
    super('DUPLICADO', mensaje, 409);
  }
}

export class HorarioNoDisponible extends ErrorDominio {
  constructor(mensaje = 'Ese horario ya no está disponible') {
    super('HORARIO_NO_DISPONIBLE', mensaje, 409);
  }
}

export class TransicionNoPermitida extends ErrorDominio {
  constructor(mensaje = 'Ese cambio de estado no está permitido') {
    super('TRANSICION_NO_PERMITIDA', mensaje, 409);
  }
}

export class LimiteDelPlan extends ErrorDominio {
  constructor(mensaje = 'Se alcanzó el límite del plan') {
    super('LIMITE_DEL_PLAN', mensaje, 403);
  }
}

/**
 * Convierte los errores de PostgreSQL que significan una regla del negocio
 * en errores del dominio. Cualquier otro error se devuelve sin cambios.
 */
export function traducirErrorPostgres(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return error;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  const texto = typeof message === 'string' ? message : '';

  if (code === '23P01') {
    // Restricción de exclusión: distinguir el choque de CITAS de otros cruces de horario.
    const { constraint } = error as { constraint?: unknown };
    return constraint === 'citas_sin_solapes'
      ? new HorarioNoDisponible()
      : new DatosInvalidos('El horario se cruza con otro ya registrado');
  }
  if (code === '23505') return new Duplicado(); // restricción UNIQUE
  if (code === '23514' && texto.startsWith('Transición de cita no permitida')) {
    return new TransicionNoPermitida(texto);
  }
  return error;
}
