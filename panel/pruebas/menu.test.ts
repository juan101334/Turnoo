import { describe, expect, it } from 'vitest';
import { cookieDelMenu, leerMenuPlegado } from '@/lib/menu';

describe('cookie del menú lateral', () => {
  it('solo "plegado" lo pliega; sin cookie u otro valor, va abierto', () => {
    expect(leerMenuPlegado('plegado')).toBe(true);
    for (const otro of [undefined, '', 'abierto', 'PLEGADO', 'plegado ']) expect(leerMenuPlegado(otro)).toBe(false);
  });

  it('plegar la guarda un año; abrir la borra', () => {
    expect(cookieDelMenu(true, false)).toBe('turnoo_menu=plegado; Max-Age=31536000; Path=/; SameSite=Lax');
    expect(cookieDelMenu(false, false)).toBe('turnoo_menu=; Max-Age=0; Path=/; SameSite=Lax');
  });

  it('en https va con Secure', () => {
    expect(cookieDelMenu(true, true)).toMatch(/; Secure$/);
    expect(cookieDelMenu(false, true)).toMatch(/; Secure$/);
  });
});
