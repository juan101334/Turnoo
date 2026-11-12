/**
 * El WhatsApp del soporte de Turnoo (SOPORTE_WHATSAPP), en formato internacional: "+57 300 123 4567"
 * o "573001234567". Se guarda solo con dígitos, que es lo que pide wa.me.
 *
 * Sin la variable, no hay enlace (el texto "soporte de Turnoo" queda sin enlace). Con un valor que
 * no es un número internacional, el panel no arranca: mejor enterarse al desplegar que dejar a un
 * dueño con un enlace que no lleva a nadie.
 */
export function numeroDeSoporte(valor: string | undefined): string | null {
  const texto = valor?.trim() ?? '';
  if (texto === '') return null;
  const digitos = texto.replace(/[\s().-]/g, '').replace(/^\+/, '');
  // E.164: hasta 15 dígitos y sin 0 al inicio (el código de país nunca empieza por 0).
  if (!/^[1-9]\d{7,14}$/.test(digitos)) {
    throw new Error('SOPORTE_WHATSAPP debe ser un número en formato internacional, ej. +57 300 123 4567 (revisa panel/.env.local)');
  }
  return digitos;
}

/** Enlace que abre el chat con el soporte en WhatsApp (app o web). */
export const enlaceDeSoporte = (numero: string) => `https://wa.me/${numero}`;
