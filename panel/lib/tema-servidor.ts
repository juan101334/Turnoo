import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_TEMA, leerTema, type Tema } from './tema';

/** El tema elegido en la cookie, para pintarlo desde el servidor. */
export async function temaElegido(): Promise<Tema> {
  return leerTema((await cookies()).get(COOKIE_TEMA)?.value);
}
