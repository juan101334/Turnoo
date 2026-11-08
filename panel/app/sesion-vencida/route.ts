import { NextResponse, type NextRequest } from 'next/server';
import { borrarSesion } from '@/lib/sesion';

/**
 * Llega aquí quien tiene una cookie que el backend ya no acepta (venció o se revocó). Solo borra
 * la cookie (no llama al backend) y lleva al login: peor caso, alguien te saca de una sesión muerta.
 */
export async function GET(request: NextRequest) {
  await borrarSesion();
  return NextResponse.redirect(new URL('/login?vencida=1', request.url), 303);
}
