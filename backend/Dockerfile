# Imagen del backend de Turnoo. Se construye desde la RAÍZ del repositorio (necesita db/migrations):
#   docker compose -f docker-compose.prod.yml --env-file .env.produccion build
#
# Dos imágenes finales:
#  - api: solo dependencias de producción y el código compilado (dist).
#  - herramientas: con tsx, para las migraciones y los scripts del superadmin.

FROM node:22-bookworm-slim AS dependencias
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM dependencias AS compilado
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# Migraciones y scripts. scripts/migraciones.ts busca las migraciones en ../../db/migrations,
# es decir, /app/db/migrations.
FROM dependencias AS herramientas
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY db/migrations /app/db/migrations
USER node
CMD ["./node_modules/.bin/tsx", "scripts/migrar.ts"]

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=compilado /app/backend/dist ./dist
# Carpeta de las imágenes de los clientes. El volumen que se monta aquí hereda este dueño.
RUN mkdir -p /datos/archivos && chown node:node /datos/archivos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/index.js"]
