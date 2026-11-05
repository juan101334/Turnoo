export type TipoMensaje = 'texto' | 'audio' | 'imagen' | 'otro';

/** Un mensaje de WhatsApp ya validado y en los términos de Turnoo. */
export interface MensajeEntrante {
  waMessageId: string;
  /** Al menos uno de los dos: teléfono o BSUID. */
  telefono: string | null;
  waUserId: string | null;
  nombre: string | null;
  tipo: TipoMensaje;
  contenido: string | null;
  mediaId: string | null;
  enviadoEn: Date;
}

export interface ResultadoEvento {
  /** Mensajes que no se pudieron guardar por un fallo que puede ser pasajero. */
  fallidos: number;
}

/** Una cuenta de WhatsApp de un negocio, tal como la ve el superadmin. Nunca incluye el token. */
export interface CuentaRegistrada {
  id: string;
  phoneNumberId: string;
  wabaId: string;
  numeroVisible: string;
  activa: boolean;
  createdAt: Date;
}

export interface EntradaCuenta {
  phoneNumberId: string;
  wabaId: string;
  numeroVisible: string;
  /** Token de acceso de Meta, en claro. Se guarda cifrado. */
  token: string;
}

export interface CambiosCuenta {
  numeroVisible?: string | undefined;
  token?: string | undefined;
  activa?: boolean | undefined;
}

export type EmisorSaliente = 'ia' | 'humano' | 'sistema';

/**
 * Cómo terminó un envío. Un fallo de Meta no es una excepción: el mensaje queda guardado como
 * `fallido` y quien envía decide si reintenta según `reintentable`.
 */
export type ResultadoEnvio =
  | { estado: 'enviado'; mensajeId: string; waMessageId: string }
  | { estado: 'fallido'; mensajeId: string; reintentable: boolean };

/** Respuesta de la API de Meta, ya traducida. */
export type RespuestaMeta =
  | { ok: true; waMessageId: string }
  | { ok: false; reintentable: boolean; detalle: string };

export interface ConfiguracionWebhook {
  appSecret: string;
  verifyToken: string;
}
