# CLAUDE.md — nowcleanny (SCIP)

Sistema de control de inventario, producción y reporte de sobreventa para NOW CLEANY S.A.S., manufacturera de
productos de limpieza (cloro y similares) en Montería, Colombia. Demo para presentar e iterar rápido:
**monolito simple** (NestJS + PostgreSQL, un esquema, una conexión), sin pruebas por ahora. Alcance
funcional detallado: `docs/alcance-scip.md`; por qué se simplificó: `docs/adr/0003-monolito-simple.md`.

## Problema y reglas de negocio

- Problema: las preventas no se cruzan con las materias primas disponibles ("teléfono roto" entre ventas y
  planta). Planta se queda sin insumos y compras compra de urgencia.
- Objetivo: desde que se confirma una preventa, saber qué hay que producir, envasar y comprar.
- **La sobreventa es válida**: ventas nunca se bloquea; el **físico** puede quedar negativo.
- **La preventa no descuenta inventario**: lo confirmado queda como comprometido y el inventario proyectado
  (físico − comprometido) es informativo. El físico solo cambia con movimientos reales (despacho, producción…).
- **Cartera por vendedor**: cada cliente tiene un vendedor; un vendedor no ve clientes, preventas ni visitas de
  otro. Gerencia (y planta, compras, bodega para preventas) ve todo.
- **Flujo con autorizaciones**: cada rol hace su paso, lo autoriza y lo pasa al siguiente (todo queda en la
  traza). Vendedor (preventa con fecha prometida) → consolidado/Diego (factura siempre; lo que el stock no cubre
  queda pendiente por fabricar o comprar; decide la prioridad y si se permite despacho parcial) → planta (alista
  lo que existe) → logística (guía, despacho parcial o completo, entrega) → contable (cobros y pagos).
- **Compras**: Alfonso hace las órdenes de compra con la sugerencia del mes (lo vendido el mes anterior, o su
  plan, convertido a insumos menos stock y en tránsito) y la compra urgente (faltante de lo ya vendido). Silvia
  (recepción) ingresa cada factura de proveedor contra la orden: es el soporte para que entre la mercancía; una
  orden puede recibir varias facturas.
- Compra y venta: además de lo que fabrican, venden mercancía de reventa (escobas, recogedores…) sin fórmula.
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
| fórmula, línea, rinde (bache)            | formula, formula line, `batchYield`                      |
| merma (sobrante del tanque, daño)        | waste (movimiento `WASTE`)                               |
| borrador / vigente / retirada            | `DRAFT` / `ACTIVE` / `RETIRED`                           |
| requerimientos                           | requirements                                             |
| bodega (PLANTA, DESPACHO)                | warehouse (códigos de datos `PLANTA`, `DESPACHO`)        |
| movimiento / saldo / kardex              | stock movement / stock balance / kardex                  |
| físico / comprometido / proyectado       | `onHand` / `committed` / `projected`                     |
| recepción / traslado / despacho / ajuste | receipt / transfer / dispatch / adjustment               |
| carga inicial                            | initial load                                             |
| preventa (pedido), cliente, vendedor     | sales order, customer, seller                            |
| NIT / cédula, razón social, sucursal     | document (`NIT`/`CC`), name, branch                      |
| cartera, visita (en sitio)               | portfolio, visit (`onSite`)                              |
| proveedor                                | supplier                                                 |
| factura de venta / de proveedor          | invoice / supplier invoice                               |
| cobro / pago                             | payment (customer) / supplier payment                    |
| guía de despacho                         | shipment                                                 |
| traza                                    | trail (activity log)                                     |
| mercancía de reventa                     | `RESALE`                                                 |
| plan de compras del mes                  | purchase plan                                            |
| fecha estimada de entrega                | `estimatedDeliveryDate`                                  |
| orden de producción / envasado           | production order (granel) / production order (terminado) |
| orden de compra, en tránsito             | purchase order, on order                                 |
| reporte de sobreventa, sin cobertura     | oversell report, uncovered                               |
| necesidades de producción / de compra    | production needs / purchase needs                        |

## Stack (fijo; no cambiarlo sin preguntar)

- Node.js 24 LTS (`.nvmrc`), TypeScript 6 estricto, pnpm 12 workspaces (`packageManager` con hash).
- NestJS 12 (**solo ESM**: `"type": "module"`, imports relativos con extensión `.js`) sobre FastifyAdapter.
  ValidationPipe global con `whitelist` y `forbidNonWhitelisted`, class-validator + class-transformer.
- PostgreSQL 18 con Kysely + pg. Un solo esquema en `platform/db/schema.sql`.
- nestjs-pino, nestjs-cls + @nestjs-cls/transactional + adaptador Kysely, @nestjs/config, @nestjs/swagger
  (solo fuera de producción), @nestjs/throttler, @fastify/helmet, argon2 (Argon2id).
- Sin pruebas automáticas por ahora (decisión del usuario): se verifica con lint, tipos y pantallazos.
- ESLint 10 + typescript-eslint + Prettier.
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
  main.ts  migrate.ts  seed.ts         API, esquema + semillas (misma imagen)
  platform/        config, db (una conexión + schema.sql), errores, seguridad (guards, @Permission,
                   @Public), logging, health
  modules/<module>/
    <module>.module.ts  index.ts  <module>.tables.ts
    domain/        reglas puras (sin @nestjs/*, kysely ni otras capas)
    <feature>/     *.controller.ts *.service.ts *.repository.ts (SQL con Kysely) dto/
    seeds/         datos de ejemplo
  shared-kernel/   Quantity, errores base, CSV
apps/web/          React + Vite + Tailwind (paneles)
docs/adr/  docs/alcance-scip.md  docs/preguntas-abiertas.md
ops/       compose, Dockerfile, scripts
```

Módulos: `identity`, `product`, `inventory`, `sales`, `production`, `purchasing`, `planning`, `billing`,
`logistics`, `audit` (traza), `maps` y `demo` (datos de ejemplo de punta a punta, solo para semillas).

## Reglas del código

1. Controlador → servicio → repositorio (clase concreta con SQL de Kysely). Las reglas de negocio viven en
   `domain/`. Los módulos se usan entre sí por sus servicios (se exportan en `index.ts`).
2. Un esquema, una conexión y `@Transactional()`: una operación es una transacción, aunque toque varios
   módulos (completar un envasado registra entrada, consumos y merma en la misma transacción).
3. Cantidades en `bigint` en unidad base (mg, mL, un); nunca `number` para cantidades ni dinero. En DTOs,
   cadenas decimales (`"2.5"`) con unidad. Redondeo hacia arriba al calcular requerimientos.
4. Toda ruta declara `@Permission('x:y')` o `@Public()`; el guard global deniega por defecto. Roles y
   permisos en código: `modules/identity/access.ts`.
5. Errores de dominio con código estable → `application/problem+json` (404, 409, 422, 403).
6. Logs JSON con requestId y actorId; nunca contraseñas, tokens ni el cuerpo de una petición.
7. El esquema se crea con `migrate.ts` (nunca al arrancar la API). Para cambios en una base existente, SQL a
   mano o volver a sembrar una base nueva.

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
- `requirements(qty) = line * qty / yield`, redondeado hacia arriba en unidad base (la fórmula no lleva merma:
  se registra al envasar); explosión
  multinivel para planeación. Importación de productos por CSV.

**inventory** (único que escribe stock)

- Bodegas `PLANTA` y `DESPACHO` (`warehouse_id` en todo el modelo). Movimientos: libro inmutable (solo
  `INSERT`), cantidad con signo y saldo resultante (kardex). Saldos (`onHand`) actualizados en la
  misma transacción, con `SELECT ... FOR UPDATE` en orden fijo. Sin `CHECK` de no negativos.
- Sin reservas: el comprometido se calcula de las preventas confirmadas (lectura de las tablas de ventas).
- Merma: movimiento `WASTE` (permiso `inventory:waste`) o al completar un envasado (granel sobrante).
- Operaciones con clave de idempotencia: recepción, consumo/producción (desde `production`), traslado
  PLANTA → DESPACHO, despacho, ajuste (permiso restringido y auditado), carga inicial por CSV.
- Estado: físico (total y por bodega), comprometido y proyectado. La capacidad de fabricación vive en planning.

**sales**

- Cliente: NIT (razón social) o cédula (nombre), dirección, teléfono, ciudad, vendedor dueño de la cartera
  (`customers:assign` para cambiarlo) y sucursales con ubicación (lat/lng). Preventa con cliente, sucursal de
  entrega, vendedor, fecha estimada de entrega, notas y líneas de terminado. Sin precios en esta fase.
- Visitas: el vendedor registra su posición GPS en el cliente; se calcula la distancia a la sucursal y si fue
  en sitio (150 m + precisión). Una visita puede quedar ligada a la preventa que se tomó.
- `DRAFT → CONFIRMED (por consolidar) → INVOICED → READY ⇄ PARTIAL → DISPATCHED → DELIVERED | CANCELLED`.
  Lo comprometido es lo vendido menos lo despachado; solo el despacho (por guía) mueve stock.

**production**

- Orden de producción `PLANNED → COMPLETED | CANCELLED` para un `BULK` (producción por litros o baches) o un
  `FINISHED_GOOD` (envasado). Al completarla con la cantidad real, inventory registra la entrada del producto
  y el consumo de la fórmula vigente (un nivel), en una operación idempotente. Al completar un envasado se
  puede registrar el granel que quedó en el tanque como merma (`bulkWaste`).

**purchasing**

- Proveedores (NIT, contacto, teléfono, correo, ciudad). Orden de compra simple: proveedor, fecha esperada, líneas de materia prima. `OPEN → RECEIVED |
CANCELLED`. Recibir registra la recepción en inventory con las cantidades reales y cierra la orden.

**planning** (solo lectura; compone los servicios de los demás módulos, sin tablas)

- Necesidades netas multinivel: terminado `toPack = max(0, committed - onHand)`; granel requerido por envasado
  menos físico y producción planeada; materias primas requeridas menos físico y en tránsito → `toBuy`.
- Reporte de sobreventa: vendido por vendedor, capacidad con lo disponible, sin cobertura y compras necesarias.
  El plan es global, pero un vendedor solo recibe sus propios pedidos.

**maps**

- Token público de Mapbox para el mapa del panel (`MAPBOX_PUBLIC_TOKEN`) y búsqueda de direcciones desde el
  servidor (`MAPBOX_GEOCODING_TOKEN`). Los tokens viven en `.env`, nunca en el repositorio.

**billing**

- Facturas de venta (una por preventa, precio del producto + IVA 19 %, plazo 30 días) con la cobertura al facturar
  (sale del stock / pendiente). Cobros del contable. Reporte financiero: por cobrar, por pagar, cobros y pagos.

**logistics**

- Guías (transportador, placa, conductor, ruta) con lo que planta entregó de cada pedido; despacho y entrega.

**identity**

- users, user_roles, sessions. Roles y permisos en `identity/access.ts`: `admin`, `manager`,
  `sales`, `consolidator`, `plant`, `logistics`, `purchasing`, `receiving`, `accountant`. El rol va en el token
  (para la traza). Login Argon2id, JWT de acceso de 15 min.
  Admin inicial desde variables de entorno.

## Comandos

```
pnpm install --frozen-lockfile   instalar (respeta la política de seguridad)
docker compose up -d             PostgreSQL de desarrollo (puerto POSTGRES_PORT de .env)
pnpm db:showcase                 esquema + datos de demo con volumen (sobre una base vacía)
pnpm api  |  pnpm web            API (127.0.0.1:3000) y paneles (localhost:5173)
pnpm verify                      format:check + lint + typecheck
```

## Forma de trabajar

- Funcional primero. Bloque A: backend funcional (plataforma + identidad → productos → inventario →
  preventa, producción y compras → planeación y datos de demo). Bloque B: frontend. Bloque C: endurecimiento.
- Sin pruebas por ahora: iterar rápido sobre la demo. Verificar con `pnpm verify` y pantallazos.
- Cada hito: commit convencional (en inglés) y resumen de máximo 10 líneas; antes, plan de máximo 15 líneas.
- Pedir confirmación solo si una decisión cambia el stack o el modelo.
- Verificar APIs de librerías en los paquetes instalados (`node_modules`, `.d.ts`, CHANGELOG), no de memoria:
  NestJS 12, nestjs-cls 7, Kysely 0.29 y pnpm 12 cambiaron respecto a versiones anteriores.
- Red solo para registros de paquetes e imágenes Docker. Sin comandos destructivos, sin push, sin secretos.
- Ambigüedades: default más simple y anotarlo en `docs/preguntas-abiertas.md`. No inventar requisitos.
- Frontend: antes de diseñar, leer la skill oficial `frontend-design`
  (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`)
  y la skill `dataviz` para indicadores y gráficos; revisar con pantallazos (skill `run` / Chrome).
