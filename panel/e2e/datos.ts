import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export interface Datos {
  clave: string;
  dueno: string;
  empleado: string;
  superadmin: string;
  limite: string;
  invitacion: { email: string; token: string };
  recuperacion: { email: string; token: string };
  /** Pasado mañana (en la zona del negocio), con citas sembradas; y una cita de otro barbero. */
  agenda: { fecha: string; citaAjena: string };
  /** Día solo para mirar la agenda: 9:00 una cita por barbero; 13:00 a 14:00, almuerzo del Barbero E2E. */
  vista: { fecha: string };
  /** Dueña solo para cambiar su contraseña (cuenta.spec.ts). */
  cuenta: string;
  /** Clientes sin citas (ver sembrar.ts). */
  clientes: { editable: string; borrable: string; telefonoSinNombre: string };
  /** Conversaciones de WhatsApp: derivada hace 11 min, vieja (cliente escribió hace 30 h) y otra con el asistente. */
  conversaciones: { derivada: string; vieja: string; conIa: string };
}

let leidos: Datos | undefined;

/**
 * Lo que sembró e2e/preparar.ts en esta corrida. Se lee al usarlo, no al importar: Playwright
 * carga los archivos de pruebas antes de correr la preparación.
 */
export function datos(): Datos {
  leidos ??= JSON.parse(readFileSync(new URL('./.datos.json', import.meta.url), 'utf8')) as Datos;
  return leidos;
}

export const BACKEND = 'http://localhost:3100';
export const COOKIE = 'turnoo_sesion';

export async function entrar(page: Page, email: string, clave = datos().clave) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export async function entrarYEsperar(page: Page, email: string, ruta = '/hoy') {
  await entrar(page, email);
  await expect(page).toHaveURL(ruta);
}

/** Mensaje de error del panel. Next tiene su propio role="alert" (el anunciador de rutas): se excluye. */
export const alerta = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
