import { describe, expect, it } from 'vitest';
import { enlaceDeSoporte, numeroDeSoporte } from '@/lib/soporte';

describe('WhatsApp del soporte (SOPORTE_WHATSAPP)', () => {
  it('sin la variable, o vacía, no hay número: no se muestra el enlace', () => {
    expect(numeroDeSoporte(undefined)).toBeNull();
    expect(numeroDeSoporte('')).toBeNull();
    expect(numeroDeSoporte('   ')).toBeNull();
  });

  it('acepta el formato internacional con o sin +, espacios, guiones y paréntesis', () => {
    expect(numeroDeSoporte('+57 300 123 4567')).toBe('573001234567');
    expect(numeroDeSoporte('573001234567')).toBe('573001234567');
    expect(numeroDeSoporte('+1 (415) 555-0100')).toBe('14155550100');
    expect(enlaceDeSoporte('573001234567')).toBe('https://wa.me/573001234567');
  });

  it('un número local, con letras o demasiado largo no arranca el panel', () => {
    for (const malo of ['3001234567x', '0573001234567', '+57 300', '1234567890123456', 'soporte@turnoo.com']) {
      expect(() => numeroDeSoporte(malo), malo).toThrow(/SOPORTE_WHATSAPP/);
    }
  });
});
