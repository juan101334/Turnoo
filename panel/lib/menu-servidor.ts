import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_MENU, leerMenuPlegado } from './menu';

/** Si el menú lateral va plegado, según la cookie, para pintarlo desde el servidor. */
export async function menuPlegado(): Promise<boolean> {
  return leerMenuPlegado((await cookies()).get(COOKIE_MENU)?.value);
}
