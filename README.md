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
docker compose up -d          # PostgreSQL 18 en 127.0.0.1:5432
pnpm db:demo                  # migraciones + semillas + datos de demo de la propuesta
pnpm api                      # API en http://127.0.0.1:3000 (Swagger en /docs)
pnpm worker                   # en otra terminal: outbox, consumidores y tareas programadas
pnpm web                      # en otra terminal: paneles en http://localhost:5173
```

El frontend (React + Vite + Tailwind) habla con la API por el proxy de Vite (`/v1` → `127.0.0.1:3000`), así
que en desarrollo no hay CORS. En producción, un proxy inverso sirve `apps/web/dist` y la API en el mismo origen.

`pnpm db:setup` hace lo mismo sin datos de demo (solo roles, permisos y el administrador de `ADMIN_*`).
Para empezar de cero en desarrollo: `docker compose down -v` (borra la base local) y `docker compose up -d`.

### Usuarios de demo

Contraseña de todos: el valor de `DEMO_PASSWORD` en `.env` (por defecto `Demo.Scip.2026`).

| Correo                         | Rol          | Para ver                                      |
| ------------------------------ | ------------ | --------------------------------------------- |
| `gerencia@nowcleany.local`     | Gerencia     | Reporte de sobreventa y todos los paneles     |
| `vendedor.a@nowcleany.local`   | Ventas       | Preventas de Andrea Ruiz (vendedor A)         |
| `vendedor.b@nowcleany.local`   | Ventas       | Bernardo Díaz (vendedor B)                    |
| `vendedor.c@nowcleany.local`   | Ventas       | Camila Torres (vendedor C)                    |
| `planta@nowcleany.local`       | Planta       | Qué producir y envasar; órdenes de producción |
| `compras@nowcleany.local`      | Compras      | Qué comprar; órdenes de compra                |
| `bodega@nowcleany.local`       | Bodega       | Recepciones, traslados y despachos            |
| `formulacion@nowcleany.local`  | Formulador   | Productos y borradores de fórmula             |
| `jefe.tecnico@nowcleany.local` | Jefe técnico | Publicación de fórmulas (cuatro ojos)         |

Los datos de demo son ilustrativos y reproducen el ejemplo de la propuesta: 2.950 cajas de cloro 00224
vendidas por tres vendedores, capacidad para 2.000 con las materias primas disponibles y 950 sin cobertura.

## Comandos

| Comando                    | Qué hace                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm verify`              | Formato, lint, tipos, reglas de arquitectura y todas las pruebas |
| `pnpm test`                | Pruebas unitarias y de punta a punta (estas necesitan Docker)    |
| `pnpm test:unit`           | Solo unitarias y de arquitectura (rápidas, sin Docker)           |
| `pnpm test:e2e`            | Flujo completo contra un PostgreSQL desechable (Testcontainers)  |
| `pnpm lint`                | ESLint (type-checked)                                            |
| `pnpm typecheck`           | TypeScript estricto                                              |
| `pnpm depcruise`           | Reglas de arquitectura (fronteras entre módulos y capas)         |
| `pnpm audit`               | Vulnerabilidades conocidas en dependencias                       |
| `pnpm build`               | Compila la API a `apps/api/dist`                                 |
| `pnpm db:migrate`          | Compila y aplica migraciones                                     |
| `pnpm db:setup`            | Migraciones + semillas (roles, permisos, administrador)          |
| `pnpm db:demo`             | Migraciones + semillas + datos de demo                           |
| `pnpm api` / `pnpm worker` | Ejecutan la API / el worker compilados con `.env`                |

## Producción

Una sola imagen (distroless, usuario no root) con tres entradas. En producción no se ejecuta `pnpm install`.

```sh
docker build -f ops/Dockerfile -t scip-api .
docker run --env-file prod.env scip-api dist/migrate.js --seed   # una vez por versión
docker run --env-file prod.env -p 3000:3000 scip-api             # API (N instancias)
docker run --env-file prod.env scip-api dist/worker.js           # worker
```

Variables: las de `.env.example`. En producción usa secretos reales para `DB_*_PASSWORD`, `JWT_SECRET`
(32+ caracteres aleatorios) y `ADMIN_PASSWORD`; `NODE_ENV=production` desactiva Swagger.

## Arquitectura en una página

Monolito modular (NestJS 12 sobre Fastify, PostgreSQL 18 con Kysely). Cada módulo tiene su esquema, su rol de
base de datos y su pool, y solo expone su `index.ts`; dependency-cruiser lo verifica en CI.

| Módulo       | Responsabilidad                                                               |
| ------------ | ----------------------------------------------------------------------------- |
| `identity`   | Usuarios, roles como datos, permisos sincronizados desde el código, JWT       |
| `product`    | Materias primas, granel y terminados; fórmulas versionadas en dos niveles     |
| `inventory`  | Único que escribe stock: kardex inmutable, saldos, reservas por preventa      |
| `sales`      | Clientes y preventas (vendedor, fecha estimada de entrega)                    |
| `production` | Órdenes de producción de granel y de envasado                                 |
| `purchasing` | Órdenes de compra (lo que está en tránsito)                                   |
| `planning`   | Sobreventa, cobertura de preventas y necesidades netas de producción y compra |

Entre módulos: llamadas a la API pública (con revalidación de permisos e idempotencia) o eventos por outbox
transaccional con inbox en el consumidor.

## Cómo agregar un módulo

1. Crea `apps/api/src/modules/<nombre>/` con `domain/` (reglas puras), una carpeta por funcionalidad
   (`*.controller.ts`, `*.service.ts`, `*.repository.ts` abstracto y `kysely-*.repository.ts`), `permissions.ts`,
   `<nombre>.module.ts` e `index.ts` con lo que otros módulos pueden usar.
2. Escribe las tablas en `migrations/0001_<algo>.sql` (sin esquema explícito: se crean en el del módulo) y sus
   tipos en `<nombre>.tables.ts`.
3. Importa `DatabaseModule.forModule('<nombre>')` en el módulo y usa `@Transactional('<nombre>')` en los
   servicios y `@InjectTransactionHost('<nombre>')` en los repositorios Kysely.
4. Declara los permisos con `@DeclaresPermissions([...])` (con sus roles por defecto) y protege cada ruta con
   `@Permission('area:accion')` o `@Public()`; sin decorador, la ruta queda denegada.
5. Registra el nombre en `DATABASE_MODULES` (`src/module-registry.ts`), el módulo en
   `src/feature-modules.ts` y su contraseña `DB_PASSWORD_<NOMBRE>` en `.env.example`.
6. `pnpm db:migrate` crea el esquema, el rol `app_<nombre>` y aplica las migraciones. `pnpm verify` debe
   quedar en verde.
