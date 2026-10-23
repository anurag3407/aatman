# Production images (Next.js standalone output).
#   App:        docker build -t aatman .
#   Migrations: docker build --target migrate -t aatman-migrate .
# On a VPS, deploy/compose.yaml builds both for you (see docs/deployment.md).
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Production dependencies only, for the migration image.
FROM node:24-slim AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Release step: applies ./drizzle migrations, then exits. The standalone server bundles
# drizzle-orm into its chunks, so the runner needs its own node_modules.
FROM node:24-slim AS migrate
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 1001 app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts/migrate.mjs ./scripts/migrate.mjs
USER app
CMD ["node", "scripts/migrate.mjs"]

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Version-skew protection across rolling deploys: clients of an older build hard-reload
# instead of calling Server Functions or loading chunks that no longer exist.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
RUN pnpm build

# The app server. Kept last so a plain `docker build` produces it.
FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 app
COPY --from=prod-deps --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
COPY --chown=app drizzle ./drizzle
COPY --chown=app scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=app scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./scripts/start.sh"]
