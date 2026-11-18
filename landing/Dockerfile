# Imagen de Caddy con la landing adentro. Se construye desde la RAÍZ del repositorio:
#   docker compose -f docker-compose.prod.yml --env-file .env.produccion build caddy
#
# La landing es un sitio estático (Next.js con output: 'export'): se compila aquí y a la imagen
# final solo llegan los archivos de out/. No hay servidor de Node en producción.

FROM node:22-bookworm-slim AS dependencias
WORKDIR /app/landing
COPY landing/package.json landing/package-lock.json ./
RUN npm ci

FROM dependencias AS compilado
ENV NEXT_TELEMETRY_DISABLED=1
# El número de WhatsApp queda escrito en los enlaces al compilar. Es público.
ARG NEXT_PUBLIC_WHATSAPP
ENV NEXT_PUBLIC_WHATSAPP=$NEXT_PUBLIC_WHATSAPP
COPY landing/ ./
RUN npm run build

FROM caddy:2
COPY --from=compilado /app/landing/out /srv/landing
