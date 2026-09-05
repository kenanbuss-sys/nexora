# NexoraOS — self-hosted images (Sprint 026, OPS-002/003).
# One build stage produces three runnable targets: api, worker, web.
# The Prisma client is committed engine-free (queryCompiler), so no
# engine downloads happen at build or run time.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
ENV CI=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@nexora/api --filter=@nexora/worker \
 && pnpm --filter @nexora/web build

FROM build AS api
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/main.js"]

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
