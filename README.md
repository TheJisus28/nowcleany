# nowcleanny

Inventario, planeación de producción y necesidades de compra para una manufacturera de productos de limpieza.
Las reglas y la arquitectura están en [CLAUDE.md](CLAUDE.md); las decisiones, en [docs/adr](docs/adr).

## Requisitos

- Node.js 24.22.1 (`.nvmrc`) con corepack (incluido en Node 24): `corepack enable`
- Docker con Docker Compose

## Primeros pasos

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env        # opcional: valores de desarrollo
docker compose up -d        # PostgreSQL 18 en 127.0.0.1:5432
pnpm verify                 # formato, lint, tipos, fronteras y pruebas
```

La API, el worker, las migraciones y el frontend se agregan en los hitos siguientes.
