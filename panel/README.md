# Panel de Turnoo

Panel web para dueños y barberos (Next.js 16, App Router, TypeScript, Tailwind CSS 4). Móvil primero: el barbero lo abre desde el celular.

## Cómo funciona la sesión

El navegador solo habla con el panel; el panel habla con el backend desde su servidor.

- Al entrar, el panel guarda el token del backend en una cookie `HttpOnly`, `SameSite=Lax`, de 7 días (en producción `__Host-turnoo_sesion`, con `Secure`). El JavaScript del navegador no puede leerla, y el token nunca va en la URL ni en `localStorage`.
- Cada página y cada acción leen la cookie en el servidor y llaman al backend con `Authorization: Bearer`. Como el navegador nunca llama al backend, no hay CORS.
- CSRF: `SameSite=Lax`, y las Server Actions de Next rechazan peticiones cuyo `Origin` no es el del panel. Cerrar sesión es un POST, nunca un enlace.
- Permisos: el panel oculta lo que no corresponde al rol (`lib/navegacion.ts`) y responde "no existe" si se escribe la ruta a mano, pero quien decide es el backend.
- IP real: el panel reenvía al backend la IP del usuario en `X-Forwarded-For`, calculada con `SALTOS_PROXY` (`lib/ip.ts`), para que el límite de intentos de login cuente a cada usuario por separado. Lo que el navegador escriba en esa cabecera se descarta. En producción el puerto del panel no se expone: solo Caddy le habla.

## Correr en desarrollo

Con el backend corriendo en el puerto 3000:

```bash
cd panel
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3001
```

## Pruebas

```bash
npm run typecheck
npm test           # unitarias (Vitest): IP, llamadas al backend, navegación por rol
npm run e2e        # de punta a punta (Playwright)
```

`npm run e2e` arranca solo un backend sobre `turnoo_test` (puerto 3100) y el panel (puerto 3101), siembra los datos con `backend/pruebas/e2e/sembrar.ts` y usa el Google Chrome instalado en el equipo. Necesita la base de pruebas creada (`npm run db:pruebas` en `backend/`). Nunca toca la base de desarrollo.
