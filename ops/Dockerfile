# syntax=docker/dockerfile:1
# One image, two entry points (API and migrations). Build from the repo root:
#   docker build -f ops/Dockerfile -t scip-api .
#   docker run --env-file .env -p 3000:3000 scip-api                     # API
#   docker run --env-file .env scip-api dist/migrate.js --seed           # schema + seeds
# Production never runs `pnpm install`: dependencies are frozen in this image.

ARG BUILD_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:cb606325b7ec4af55462cb0b424a53b452a5b4a894ffe841fcf1048d216fb9f8

FROM ${BUILD_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/

# Build: all dependencies of the API (lockfile frozen, install scripts blocked by the workspace policy).
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @nowcleanny/api...
COPY tsconfig.base.json ./
COPY ops/scripts ops/scripts
COPY apps/api apps/api
RUN pnpm --filter @nowcleanny/api build

# Production dependencies only.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @nowcleanny/api...

# Runtime: distroless (no shell, no package manager), non-root user.
FROM ${RUNTIME_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
USER nonroot
EXPOSE 3000
CMD ["dist/main.js"]
