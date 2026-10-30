# syntax=docker/dockerfile:1
# The panels: static build served by nginx, which also forwards /v1 and /health to the API.
#   docker build -f ops/web.Dockerfile -t scip-web .

ARG BUILD_IMAGE=node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea
ARG RUNTIME_IMAGE=nginx:1.28-alpine

FROM ${BUILD_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @nowcleanny/web...
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm --filter @nowcleanny/web build

FROM ${RUNTIME_IMAGE} AS runtime
COPY ops/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
