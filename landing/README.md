# Landing de Turnoo

Sitio público de Turnoo (`turnooapp.com`), para dueños de barberías y salones en Colombia. Es una
sola página estática: Next.js (App Router) con `output: 'export'`, Tailwind CSS 4 y lucide-react.
No tiene servidor, cookies ni analítica. El panel sigue aparte, en `app.turnooapp.com`.

## Correrla en tu equipo

```bash
cd landing
cp .env.example .env.local   # y escribe el número en NEXT_PUBLIC_WHATSAPP
npm install
npm run dev                  # http://localhost:3002
npm run build                # deja el sitio en out/
```

`NEXT_PUBLIC_WHATSAPP` es el WhatsApp al que escriben los interesados (el mismo del soporte), en
formato internacional. Queda escrito en los enlaces `wa.me` al compilar. Sin él, o mal escrito,
la landing no compila: así no se publica un botón que no lleva a nadie.

`NEXT_PUBLIC_PANEL_URL` es la dirección del panel, a donde llevan "Iniciar sesión" (encabezado) y
"Entrar al panel" (pie). Es opcional: sin ella, `https://app.turnooapp.com`.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Textos y secciones | `app/page.tsx` |
| Planes y enlace de WhatsApp | `lib/sitio.ts` |
| Chat de ejemplo, avisos, ticket y marcos | `componentes/piezas.tsx` |
| Colores, tipografía, ticket y franja | `app/globals.css` |
| Metadatos, Open Graph | `app/layout.tsx`, `app/opengraph-image.png` |
| `robots.txt` y `sitemap.xml` | `app/robots.ts`, `app/sitemap.ts` |

Los planes de `lib/sitio.ts` deben decir lo mismo que la tabla `planes` (migración 016). Si se
cambia un precio o un límite con otra migración, hay que cambiarlo también aquí.

## Antes de publicar: lo marcado con [CONFIRMAR]

En las preguntas frecuentes hay dos textos marcados con `[CONFIRMAR: …]`, a la vista en la página.
Son cosas que no se pueden verificar en el código y no se deben inventar:

1. Si el número de WhatsApp que ya tiene la barbería se puede conectar y si sigue funcionando en
   la aplicación de WhatsApp Business (reglas de Meta).
2. El aviso de tratamiento de datos y la política de datos, pendientes de revisión legal
   (Ley 1581 de 2012).

Cuando estén confirmadas, se reescribe la respuesta y se quita la marca (`<Confirmar>` en
`app/page.tsx`).

## Capturas del panel

Las imágenes de `public/capturas/` son del panel de verdad, con una barbería inventada
("Barbería La Esquina"): ningún nombre ni teléfono es de un cliente real. Para tomarlas de nuevo:

```bash
cd panel
CAPTURAS=1 npx playwright test e2e/capturas-landing.spec.ts --project=celular
```

Eso siembra los datos en `turnoo_test` (`backend/pruebas/e2e/sembrar-landing.ts`), levanta el
panel de pruebas y guarda las capturas en modo claro y al doble de resolución. Conviene tomarlas
antes de las 6:00 p. m. (lo explica el script de siembra).

La imagen para compartir (`app/opengraph-image.png`) es una captura del hero: ver
`panel/e2e/imagen-og-landing.mjs`.

## Despliegue

`landing/Dockerfile` compila el sitio y lo mete en la imagen de Caddy, que lo sirve en
`DOMINIO_LANDING` (`despliegue/Caddyfile`). Hace falta en `.env.produccion`:

- `DOMINIO_LANDING=turnooapp.com`, con sus registros `A` (la raíz y `www`).
- `SOPORTE_WHATSAPP` con el número: ahora es obligatorio, porque la landing lo usa en sus botones.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build caddy
```
