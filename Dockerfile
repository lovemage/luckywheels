FROM node:22-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

############################################
# 1) Build member SPA (root vite)
############################################
FROM base AS web-builder
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

############################################
# 2) Build admin UI
############################################
FROM base AS admin-builder
COPY server/admin-ui/package.json server/admin-ui/package-lock.json ./
RUN npm ci
COPY server/admin-ui ./
RUN npm run build

############################################
# 3) Build server (tsc) + prisma client
############################################
FROM base AS server-builder
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/prisma ./prisma
COPY server/src ./src
COPY server/scripts ./scripts
RUN npx prisma generate
RUN npx tsc -p tsconfig.build.json

############################################
# 4) Runtime
############################################
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# Install server deps including prisma CLI (used by `prisma migrate deploy`
# at container start). We don't trim devDeps since the prisma CLI lives
# there and the image stays small enough.
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate

# Compiled server
COPY --from=server-builder /app/dist ./dist
COPY --from=server-builder /app/scripts ./scripts

# Admin UI build
COPY --from=admin-builder /app/dist ./admin-ui/dist

# Member SPA build (served from /app/server/web-dist by index.ts)
COPY --from=web-builder /app/dist ./web-dist

EXPOSE 3001
# Apply latest migrations then start. Both happen at container start so a
# missing migration aborts the deploy clearly.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
