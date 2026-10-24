# CLAUDE.md — nowcleanny (SCIP)

Sistema de control de inventario, producción y reporte de sobreventa para NOW CLEANY S.A.S., manufacturera de
productos de limpieza (cloro y similares) en Montería, Colombia. MVP con la arquitectura final correcta:
pequeño, pero el núcleo crecerá (posible ERP o integración con un ERP externo). Se despliega como **un**
monolito modular. Alcance funcional detallado: `docs/alcance-scip.md`.

## Problema y reglas de negocio

- Problema: las preventas no se cruzan con las materias primas disponibles ("teléfono roto" entre ventas y
  planta). Planta se queda sin insumos y compras compra de urgencia.
- Objetivo: desde que se confirma una preventa, saber qué hay que producir, envasar y comprar.
- **La sobreventa es válida**: ventas nunca se bloquea; el disponible y el **físico** pueden quedar negativos.
- **Nunca sobreinventario**: la sugerencia de compra es exactamente el faltante neto (sin stock de seguridad ni
  punto de reorden). Prefieren salir a comprar que tener inventario quieto.
- Paneles por equipo: Ventas, Planta, Compras, Inventario/Bodega y Gerencia.
- El frontend es el entregable que verá el cliente: profesional, pulido y responsive.
- Sin edge cases rebuscados: la solución más simple que resuelva el flujo real.

## Idioma

- Código en inglés: identificadores, tablas, columnas, enums, permisos, roles, rutas HTTP, campos JSON,
  comentarios, commits.
- Salidas en español: mensajes de error de la API (`title`/`detail`), mensajes de validación, textos de la
  interfaz, nombres visibles, mensajes de log y de scripts, documentación.

| Español                                  | Código                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| materia prima / granel / terminado       | `RAW_MATERIAL` / `BULK` / `FINISHED_GOOD`                |
| fórmula, línea, rinde (bache), merma     | formula, formula line, `batchYield`, `wasteBps`          |
| borrador / vigente / retirada            | `DRAFT` / `ACTIVE` / `RETIRED`                           |
| requerimientos                           | requirements                                             |
| bodega (PLANTA, DESPACHO)                | warehouse (códigos de datos `PLANTA`, `DESPACHO`)        |
| movimiento / saldo / reserva / kardex    | stock movement / stock balance / reservation / kardex    |
| físico / reservado / disponible          | `onHand` / `reserved` / `available`                      |
| recepción / traslado / despacho / ajuste | receipt / transfer / dispatch / adjustment               |
| carga inicial                            | initial load                                             |
| preventa (pedido), cliente, vendedor     | sales order, customer, seller                            |
| fecha estimada de entrega                | `estimatedDeliveryDate`                                  |
| orden de producción / envasado           | production order (granel) / production order (terminado) |
| orden de compra, en tránsito             | purchase order, on order                                 |
| reporte de sobreventa, sin cobertura     | oversell report, uncovered                               |
| necesidades de producción / de compra    | production needs / purchase needs                        |

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
docs/adr/  docs/alcance-scip.md  docs/preguntas-abiertas.md
ops/       compose, Dockerfile, scripts
```

Módulos: `identity`, `product`, `inventory`, `sales`, `production`, `purchasing`, `planning`.

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

- Producto: `RAW_MATERIAL` | `BULK` | `FINISHED_GOOD`; código único en mayúsculas (puede ser numérico, p. ej.
  `00224`); unidad de stock inmutable (kg, g, mg, L, mL, un); se desactiva en vez de borrarse.
- Fórmula de `BULK` (química, por bache: rinde X L, con capacidad máxima de bache) y de `FINISHED_GOOD`
  (envasado: litros de granel + envases, tapas, etiquetas, cajas). Líneas de `BULK` solo usan `RAW_MATERIAL`;
  líneas de `FINISHED_GOOD` usan `BULK` o `RAW_MATERIAL` (sin ciclos).
- Versionada `DRAFT → ACTIVE → RETIRED`, inmutable al publicar; un borrador y una vigente por producto
  (índices únicos parciales); triggers impiden tocar una publicada. Cuatro ojos: quien define no publica,
  salvo permiso `product:publish-own`.
- `requirements(qty) = line * qty * (1 + waste) / yield`, redondeado hacia arriba en unidad base; explosión
  multinivel para planeación. Importación de productos por CSV.

**inventory** (único que escribe stock)

- Bodegas `PLANTA` y `DESPACHO` (`warehouse_id` en todo el modelo). Movimientos: libro inmutable (solo
  `INSERT`), cantidad con signo y saldo resultante (kardex). Saldos (`onHand`, `reserved`) actualizados en la
  misma transacción, con `SELECT ... FOR UPDATE` en orden fijo. Sin `CHECK` de no negativos.
- Reservas de terminado por pedido, `UNIQUE (order_id, product_id)` (idempotencia).
- Operaciones con clave de idempotencia: recepción, consumo/producción (desde `production`), traslado
  PLANTA → DESPACHO, despacho, ajuste (permiso restringido y auditado), carga inicial por CSV.
- Estado: físico, reservado, disponible y "producible".

**sales**

- Cliente mínimo (nombre, NIT opcional). Preventa con cliente, vendedor (usuario que la registra), fecha
  estimada de entrega, notas y líneas de terminado. Sin precios en esta fase.
- `DRAFT → CONFIRMED → DISPATCHED | CANCELLED`. Confirmar = `inventory.reserve` (su transacción, nunca falla
  por stock) y luego marcar el pedido (su transacción); reintentar es seguro. Job en el worker libera reservas
  de pedidos que sigan en `DRAFT` tras 30 min. Anular publica `SalesOrderCancelled`; inventory lo consume
  (inbox) y libera reservas. Despachar crea el movimiento de despacho y consume la reserva.

**production**

- Orden de producción `PLANNED → COMPLETED | CANCELLED` para un `BULK` (producción por litros o baches) o un
  `FINISHED_GOOD` (envasado). Al completarla con la cantidad real, inventory registra la entrada del producto
  y el consumo de la fórmula vigente (un nivel), en una operación idempotente.

**purchasing**

- Orden de compra simple: proveedor (texto), fecha esperada, líneas de materia prima. `OPEN → RECEIVED |
CANCELLED`. Recibir registra la recepción en inventory con las cantidades reales y cierra la orden.

**planning** (solo lectura; compone las API públicas, sin tablas)

- Necesidades netas multinivel: terminado `toPack = max(0, reserved - onHand)`; granel requerido por envasado
  menos físico y producción planeada; materias primas requeridas menos físico y en tránsito → `toBuy`.
- Reporte de sobreventa: vendido por vendedor, capacidad con lo disponible, sin cobertura y compras necesarias.

**identity**

- users, roles, permissions, role_permissions, user_roles. Cada módulo declara permisos en `permissions.ts`;
  la plataforma los sincroniza al arrancar. Roles semilla: `admin`, `manager`, `formulator`,
  `technical_lead`, `sales`, `plant`, `purchasing`, `warehouse`. Login Argon2id, JWT de acceso de 15 min.
  Admin inicial desde variables de entorno.

## Comandos

```
pnpm install --frozen-lockfile   instalar (respeta la política de seguridad)
docker compose up -d             PostgreSQL de desarrollo (127.0.0.1:5432)
pnpm verify                      format:check + lint + typecheck + depcruise + test
pnpm test | pnpm lint | pnpm typecheck | pnpm depcruise | pnpm audit
```

## Forma de trabajar

- Funcional primero. Bloque A: backend funcional (plataforma + identidad → productos → inventario →
  preventa, producción y compras → planeación y datos de demo). Bloque B: frontend. Bloque C: endurecimiento.
- Pruebas donde un error sale caro: cálculos de negocio (requerimientos, necesidades, sobreventa) y una prueba
  de punta a punta del flujo completo contra PostgreSQL real; dependency-cruiser y lint siempre en verde. La
  suite completa (concurrencia, variantes de rutas, permisos exhaustivos, aceptación) va en el bloque C.
- Cada hito: commit convencional (en inglés) y resumen de máximo 10 líneas; antes, plan de máximo 15 líneas.
- Pedir confirmación solo si una decisión cambia el stack o el modelo.
- Verificar APIs de librerías en los paquetes instalados (`node_modules`, `.d.ts`, CHANGELOG), no de memoria:
  NestJS 12, nestjs-cls 7, Kysely 0.29 y pnpm 12 cambiaron respecto a versiones anteriores.
- Red solo para registros de paquetes e imágenes Docker. Sin comandos destructivos, sin push, sin secretos.
- Ambigüedades: default más simple y anotarlo en `docs/preguntas-abiertas.md`. No inventar requisitos.
- Frontend: antes de diseñar, leer la skill oficial `frontend-design`
  (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`)
  y la skill `dataviz` para indicadores y gráficos; revisar con pantallazos (skill `run` / Chrome).
