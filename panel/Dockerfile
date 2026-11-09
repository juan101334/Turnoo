# Imagen del panel web de Turnoo. Se construye desde la RAÍZ del repositorio:
#   docker compose -f docker-compose.prod.yml --env-file .env.produccion build panel
#
# Next.js genera un servidor "standalone": solo server.js y las dependencias que de verdad usa.
# El panel no lleva secretos: solo sabe dónde está el backend (BACKEND_URL, se da al arrancar).

FROM node:22-bookworm-slim AS dependencias
WORKDIR /app/panel
COPY panel/package.json panel/package-lock.json ./
RUN npm ci

FROM dependencias AS compilado
ENV NEXT_TELEMETRY_DISABLED=1
COPY panel/ ./
RUN npm run build

FROM node:22-bookworm-slim AS panel
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=compilado --chown=node:node /app/panel/.next/standalone ./
COPY --from=compilado --chown=node:node /app/panel/.next/static ./.next/static
# standalone no incluye public/ (logo e íconos para instalar): se copia aparte.
COPY --from=compilado --chown=node:node /app/panel/public ./public
USER node
EXPOSE 3001
# /login no necesita sesión ni backend: si responde 200, el servidor del panel está vivo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
