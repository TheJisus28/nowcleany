# CLAUDE.md — nowcleanny

Sistema de inventario y planeación para una manufacturera de productos de limpieza (cloro y similares) en
Montería, Colombia. MVP con la arquitectura final correcta: pequeño, pero el núcleo crecerá (posible ERP o
integración con un ERP externo). Se despliega como **un** monolito modular.

## Problema y reglas de negocio

- Problema: "teléfono roto" entre ventas y planta. Siempre faltan insumos y compras sale a comprar a última hora.
- Objetivo: desde que se confirma un pedido, estimar qué falta fabricar y qué falta comprar, para no
  sobreinventariar materias primas y mejorar márgenes.
- **La sobreventa es válida**: ventas nunca se bloquea por falta de stock; el disponible puede quedar negativo.
- **Nunca sobreinventario**: la sugerencia de compra es exactamente el faltante (sin stock de seguridad ni punto
  de reorden).
- Paneles por equipo: **Ventas** (sus pedidos), **Planta** (qué fabricar según los pedidos), **Compras** (qué
  comprar según lo que falta), **Inventario/Bodega** (existencias y movimientos).
- El frontend es el entregable que verá el cliente: debe ser profesional, pulido y responsive.

## Idioma

- Código en inglés: identificadores, tablas, columnas, enums, permisos, rutas, comentarios, commits.
- Salidas en español: mensajes de error de la API (`title`/`detail`), mensajes de validación, textos de la
  interfaz, nombres visibles de roles y bodegas, mensajes de log y de scripts, documentación.
- Glosario (español → código):

| Español                               | Código                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| producto / materia prima / terminado  | product / `RAW_MATERIAL` / `FINISHED_GOOD`                 |
| fórmula, línea, rinde, merma          | formula, formula line, `batchYield`, `wasteBps`            |
| borrador / vigente / retirada         | `DRAFT` / `ACTIVE` / `RETIRED`                             |
| requerimientos                        | requirements                                               |
| movimiento / saldo / reserva          | stock movement / stock balance / reservation               |
| físico / reservado / disponible       | `onHand` / `reserved` / `available`                        |
| entrada / ajuste / despacho           | receipt / adjustment / dispatch                            |
| reporte de producción                 | production report                                          |
| bodega                                | warehouse (código de datos `PRINCIPAL`)                    |
| pedido (borrador/confirmado/...)      | sales order (`DRAFT`/`CONFIRMED`/`DISPATCHED`/`CANCELLED`) |
| necesidades de producción / de compra | production needs / purchase needs                          |
| faltante                              | shortage                                                   |

## Stack (fijo; no cambiarlo sin preguntar)

- Node.js 24 LTS (`.nvmrc`), TypeScript 6 estricto, pnpm 12 workspaces (`packageManager` con hash).
- NestJS 12 (**solo ESM**: `"type": "module"`, imports relativos con extensión `.js`) sobre FastifyAdapter.
  ValidationPipe global con `whitelist` y `forbidNonWhitelisted`, class-validator + class-transformer.
- PostgreSQL 18 con Kysely + pg. Migraciones SQL planas por módulo.
- nestjs-pino, nestjs-cls + @nestjs-cls/transactional + adaptador Kysely, @nestjs/config, @nestjs/swagger
  (solo fuera de producción), @nestjs/throttler, @fastify/helmet, argon2 (Argon2id).
- Pruebas: Vitest 5 (Vite 8/oxc emite la metadata de decoradores; no hace falta SWC) + Testcontainers.
- Fronteras: dependency-cruiser. ESLint 10 + typescript-eslint + Prettier.
- Docker multi-etapa (imagen mínima, usuario no root); docker compose para desarrollo.
- Frontend: React + Vite + TypeScript + Tailwind.
- **No agregar dependencias sin preguntar** (con razón y alternativa sin dependencia). Sin paquetes
  `nestjs-*` de comunidad salvo nestjs-cls y nestjs-pino.
- TypeScript 7 no se usa: typescript-eslint exige `<6.1`.

## Seguridad de dependencias

- Política en `pnpm-workspace.yaml` (en pnpm 11+ `.npmrc` solo acepta registro y autenticación):
  `saveExact`, `strictDepBuilds` + `allowBuilds` (scripts de instalación bloqueados salvo lista mínima),
  `minimumReleaseAge`, `trustPolicy: no-downgrade`, `blockExoticSubdeps`, `engineStrict`.
- Lockfile versionado; `pnpm install --frozen-lockfile` en CI; `pnpm audit` en CI; Dependabot.
- En producción no se ejecuta `pnpm install`: se compila una imagen y se despliega.

## Estructura

```
apps/api/src/
  main.ts  worker.ts  migrate.ts       tres entradas, misma imagen
  platform/        config, logging, db (pool por módulo), transacción (CLS), errores, seguridad
                   (guards, @Permission, @Public), outbox, inbox, health, registro de permisos
  modules/<module>/
    <module>.module.ts  permissions.ts  index.ts (API pública)
    domain/        clases planas: sin @nestjs/*, kysely ni otras capas
    <feature>/     *.controller.ts *.service.ts *.repository.ts (abstracta) kysely-*.repository.ts dto/
    migrations/    SQL del módulo
    tests/
  shared-kernel/   Quantity, errores base, tipos mínimos
apps/web/          React + Vite + Tailwind (paneles)
tests/architecture/  reglas de dependency-cruiser + pruebas con fixtures
docs/adr/  docs/preguntas-abiertas.md
ops/       compose, Dockerfile, scripts
```

Módulos: `identity`, `product`, `inventory`, `sales`, `planning`.

## Reglas de arquitectura (se verifican en CI)

1. Flujo controller → service → repositorio (clase abstracta como token) → implementación Kysely. Las reglas de
   negocio viven en `domain/`, no en servicios ni controladores.
2. Un módulo solo importa el `index.ts` de otro. Nadie lee tablas de otro módulo. Sin llaves foráneas entre
   esquemas.
3. Un esquema y un rol de BD por módulo (`ALTER ROLE ... SET search_path`), un pool por módulo (max 4). La app
   nunca usa el rol propietario.
4. Una transacción = un módulo (`@Transactional`). Entre módulos: API pública con idempotencia, o eventos.
5. Outbox transaccional (tabla en esquema de plataforma; los roles de módulo solo pueden `INSERT`). Despachador
   en el worker: uno activo (`pg_try_advisory_xact_lock`), `FOR UPDATE SKIP LOCKED`, orden estricto por id; un
   evento fallido detiene el lote; tras 10 intentos `failed_at` + alerta. Consumidores idempotentes con inbox.
6. Cantidades en `bigint` en unidad base (mg, mL, un); nunca `number` para cantidades ni dinero. En DTOs,
   cadenas decimales (`"2.5"`) con unidad. Redondeo hacia arriba al calcular requerimientos.
7. Toda ruta declara `@Permission('x:y')` o `@Public()`. Guard global que deniega por defecto. Autenticación
   solo con guards, nunca middleware. Los servicios revalidan permisos cuando los llama otro módulo o un job.
8. Errores de dominio con código estable → filtro global → `application/problem+json`. 404 no encontrado,
   409 conflicto, 422 validación, 403 sin permiso.
9. Logs JSON con requestId (`x-request-id` o UUID), actorId y módulo; redact de authorization, cookies,
   password y token; nunca el cuerpo completo de una petición.
10. Sin estado en memoria que importe (N instancias). Jobs solo en el worker. Migraciones solo con
    `migrate.ts`, nunca al arrancar la API.

## Modelo por módulo

**product**

- Producto: `RAW_MATERIAL` | `FINISHED_GOOD`, código único en mayúsculas, unidad de stock inmutable
  (kg, g, mg, L, mL, un), se desactiva en vez de borrarse.
- Fórmula (solo de terminado), versionada `DRAFT → ACTIVE → RETIRED`, inmutable al publicar. Un lote rinde X
  unidades; líneas = materia prima + cantidad por lote + merma en puntos básicos (100 = 1 %). Un solo borrador
  y una sola vigente por producto (índices únicos parciales). Triggers impiden tocar una fórmula publicada.
  Cuatro ojos: quien define no publica, salvo permiso `product:publish-own`.
- `requirements(qty) = line * qty * (1 + waste) / yield`, redondeado hacia arriba en unidad base.

**inventory** (único que escribe stock)

- Movimientos: libro inmutable, solo `INSERT`, cantidad con signo. Saldos por producto y bodega (`onHand`,
  `reserved`) actualizados en la misma transacción que el movimiento, con `SELECT ... FOR UPDATE` en orden fijo.
- Sobreventa: no hay `CHECK` de disponible ≥ 0; `available = onHand - reserved` puede ser negativo.
- Reservas de producto terminado por pedido con `UNIQUE (order_id, product_id)` (idempotencia).
- Operaciones: entradas (compras recibidas), reporte de producción (entra terminado y salen materias primas
  según la fórmula vigente), despacho (consume la reserva), ajustes (permiso restringido y auditado).
- Estado: físico, reservado, disponible y "producible" (máximo fabricable con materia prima libre y la que limita).

**planning** (solo lectura; compone las API públicas de inventory, product y sales)

- Producción: por terminado, `toManufacture = max(0, reserved - onHand)`, con los pedidos que lo originan.
- Compras: por materia prima, `required = Σ requirements(fórmula vigente, toManufacture)`;
  `toBuy = max(0, required - onHand)`. Exactamente el faltante.

**sales**

- Pedido `DRAFT → CONFIRMED → DISPATCHED | CANCELLED`. Confirmar = `inventory.reserve` (su transacción, nunca
  falla por stock) y luego marcar el pedido (su transacción); reintentar es seguro. Job en el worker libera
  reservas de pedidos que sigan en `DRAFT` tras 30 min. Anular publica `SalesOrderCancelled`; inventory lo
  consume (inbox) y libera reservas. Despachar crea el movimiento de despacho y consume la reserva.

**identity**

- Tablas users, roles, permissions, role_permissions, user_roles. Cada módulo declara permisos en
  `permissions.ts`; la plataforma los sincroniza al arrancar. Roles semilla: `admin`, `formulator`,
  `technical_lead`, `sales`, `plant`, `purchasing`, `warehouse`. Login Argon2id, JWT de acceso de 15 min.
  Admin inicial desde variables de entorno.

Fuera del MVP (extensiones): órdenes de producción, órdenes de compra/proveedores, varias bodegas (se usa
`PRINCIPAL` pero con `warehouse_id` en el modelo), lotes y vencimientos, facturación electrónica, WhatsApp,
modo offline.

## Comandos

```
pnpm install --frozen-lockfile   instalar (respeta la política de seguridad)
docker compose up -d             PostgreSQL de desarrollo (127.0.0.1:5432)
pnpm verify                      format:check + lint + typecheck + depcruise + test
pnpm test | pnpm lint | pnpm typecheck | pnpm depcruise | pnpm audit
```

## Forma de trabajar

- Hitos en orden; cada uno termina con pruebas y dependency-cruiser en verde, commit convencional (en inglés)
  y resumen de máximo 10 líneas. Antes de cada hito, plan de máximo 15 líneas.
- Pedir confirmación solo si una decisión cambia el stack o el modelo.
- Verificar APIs de librerías en los paquetes instalados (`node_modules`, `.d.ts`, CHANGELOG), no de memoria:
  NestJS 12, nestjs-cls 7, Kysely 0.29 y pnpm 12 cambiaron respecto a versiones anteriores.
- Red solo para registros de paquetes e imágenes Docker. Sin comandos destructivos, sin push, sin secretos.
- Ambigüedades: default más simple y anotarlo en `docs/preguntas-abiertas.md`. No inventar requisitos.
- Frontend: antes de diseñar, leer la skill oficial `frontend-design`
  (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`)
  y la skill `dataviz` para indicadores y gráficos; revisar con pantallazos (skill `run` / Chrome).
