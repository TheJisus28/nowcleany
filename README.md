# SCIP — Control de inventario, producción y sobreventa (NOW CLEANY S.A.S.)

Sistema para que ventas, planta y compras trabajen sobre los mismos datos: cada preventa confirmada se cruza
en el momento con las existencias y las fórmulas, y el sistema dice qué envasar, qué granel producir y qué
comprar (exactamente el faltante, sin sobreinventario). La sobreventa es válida: nada bloquea a ventas.

- Alcance funcional: [docs/alcance-scip.md](docs/alcance-scip.md)
- Reglas, arquitectura y forma de trabajar: [CLAUDE.md](CLAUDE.md)
- Decisiones: [docs/adr](docs/adr) · Preguntas abiertas: [docs/preguntas-abiertas.md](docs/preguntas-abiertas.md)

## Requisitos

- Node.js 24.22.1 (`.nvmrc`) con corepack (incluido en Node 24)
- Docker con Docker Compose (base de datos de desarrollo y pruebas de punta a punta)

## Arranque rápido (desarrollo)

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env          # valores solo para desarrollo
docker compose up -d          # PostgreSQL 18 (puerto POSTGRES_PORT de .env)
pnpm db:demo                  # esquema + datos de demo de la propuesta
                              # o pnpm db:showcase: lo mismo + volumen (66 productos, 29 preventas…)
pnpm api                      # API en http://127.0.0.1:3000 (Swagger en /docs)
pnpm web                      # en otra terminal: paneles en http://localhost:5173
```

El frontend (React + Vite + Tailwind) habla con la API por el proxy de Vite (`/v1` → `127.0.0.1:3000`), así
que en desarrollo no hay CORS. En producción, un proxy inverso sirve `apps/web/dist` y la API en el mismo origen.

`pnpm db:setup` hace lo mismo sin datos de demo (solo el administrador de `ADMIN_*`). Las semillas se
aplican sobre una base vacía (`DB_NAME`); para una base nueva créala en el contenedor y ejecuta el comando.
Para empezar de cero en desarrollo: `docker compose down -v` (borra la base local) y `docker compose up -d`.

### Usuarios de demo

Contraseña de todos: el valor de `DEMO_PASSWORD` en `.env` (por defecto `Demo.Scip.2026`).

| Correo                         | Rol          | Para ver                                      |
| ------------------------------ | ------------ | --------------------------------------------- |
| `gerencia@nowcleany.local`     | Gerencia     | Reporte de sobreventa y todos los paneles     |
| `vendedor.a@nowcleany.local`   | Ventas       | Preventas de Andrea Ruiz (vendedor A)         |
| `vendedor.b@nowcleany.local`   | Ventas       | Bernardo Díaz (vendedor B)                    |
| `vendedor.c@nowcleany.local`   | Ventas       | Camila Torres (vendedor C)                    |
| `vendedor.d@nowcleany.local`   | Ventas       | Diego Romero (solo con `pnpm db:showcase`)    |
| `planta@nowcleany.local`       | Planta       | Qué producir y envasar; órdenes de producción |
| `compras@nowcleany.local`      | Compras      | Qué comprar; órdenes de compra                |
| `bodega@nowcleany.local`       | Bodega       | Recepciones, traslados y despachos            |
| `formulacion@nowcleany.local`  | Formulador   | Productos y borradores de fórmula             |
| `jefe.tecnico@nowcleany.local` | Jefe técnico | Publicación de fórmulas (cuatro ojos)         |

Los datos de demo son ilustrativos y reproducen el ejemplo de la propuesta: 2.950 cajas de cloro 00224
vendidas por tres vendedores, capacidad para 2.000 con las materias primas disponibles y 950 sin cobertura.

## Comandos

| Comando            | Qué hace                                                    |
| ------------------ | ----------------------------------------------------------- |
| `pnpm verify`      | Formato, lint y tipos                                       |
| `pnpm lint`        | ESLint (type-checked)                                       |
| `pnpm typecheck`   | TypeScript estricto                                         |
| `pnpm audit`       | Vulnerabilidades conocidas en dependencias                  |
| `pnpm build`       | Compila la API (`apps/api/dist`) y la web (`apps/web/dist`) |
| `pnpm db:migrate`  | Crea el esquema en una base vacía (`schema.sql`)            |
| `pnpm db:setup`    | Esquema + administrador de `ADMIN_*`                        |
| `pnpm db:demo`     | Esquema + administrador + datos de demo de la propuesta     |
| `pnpm db:showcase` | Igual que `db:demo` más volumen para presentar              |
| `pnpm api`         | Ejecuta la API compilada con `.env`                         |
| `pnpm web`         | Paneles en modo desarrollo                                  |

## Producción

Una sola imagen (distroless, usuario no root) con dos entradas. En producción no se ejecuta `pnpm install`.

```sh
docker build -f ops/Dockerfile -t scip-api .
docker run --env-file prod.env scip-api dist/migrate.js --seed   # una vez
docker run --env-file prod.env -p 3000:3000 scip-api             # API
```

Variables: las de `.env.example`. En producción usa secretos reales para `DB_PASSWORD`, `JWT_SECRET`
(32+ caracteres aleatorios) y `ADMIN_PASSWORD`; `NODE_ENV=production` desactiva Swagger.

## Arquitectura en una página

Monolito simple: NestJS 12 sobre Fastify, PostgreSQL 18 con Kysely, **un esquema, una conexión y una
transacción por operación** (`@Transactional()`): confirmar, despachar o anular una preventa actualiza el
inventario en la misma transacción. Cada funcionalidad es una carpeta en `apps/api/src/modules/` con
controlador → servicio → repositorio (SQL con Kysely) y reglas puras en `domain/`.

| Carpeta      | Responsabilidad                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| `identity`   | Usuarios, sesiones y JWT; roles y permisos en código (`identity/access.ts`)   |
| `product`    | Materias primas, granel y terminados; fórmulas versionadas en dos niveles     |
| `inventory`  | Stock: kardex, saldos por bodega y reservas por preventa                      |
| `sales`      | Clientes y preventas (vendedor, fecha estimada de entrega)                    |
| `production` | Órdenes de producción de granel y de envasado                                 |
| `purchasing` | Órdenes de compra (lo que está en tránsito)                                   |
| `planning`   | Sobreventa, cobertura de preventas y necesidades netas de producción y compra |

Plataforma (`apps/api/src/platform/`): configuración, conexión, errores en `problem+json`, guards (toda ruta
declara `@Permission` o `@Public`), logs JSON y salud. Esquema en `platform/db/schema.sql`; datos de ejemplo
en `src/seed.ts` (en orden).

## Cómo agregar una funcionalidad

1. Crea `apps/api/src/modules/<nombre>/` con `<nombre>.module.ts`, controlador, servicio y repositorio.
2. Agrega las tablas a `platform/db/schema.sql` (en una base existente, créalas con un `ALTER`/`CREATE` a
   mano o vuelve a sembrar en una base nueva) y sus tipos en `<nombre>.tables.ts`.
3. Usa `@Transactional()` en los servicios y `@InjectTransactionHost()` en el repositorio.
4. Protege cada ruta con `@Permission('area:accion')` y agrega el permiso a `identity/access.ts`.
5. Registra el módulo en `src/feature-modules.ts`. `pnpm verify` debe quedar en verde.
