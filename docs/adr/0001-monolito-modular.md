# ADR 0001 — Monolito modular con NestJS, Kysely y un esquema de PostgreSQL por módulo

- Estado: reemplazado por la ADR 0003 (monolito simple para la demo)
- Fecha: 2026-10-24

## Contexto

El MVP debe ser pequeño pero con la arquitectura final, porque el núcleo crecerá según lo que pida el cliente
(posiblemente hacia un ERP o una integración con un ERP externo). El equipo es pequeño y la operación también:
un solo despliegue es lo razonable.

## Decisión

- **Un monolito modular**, tres entradas en la misma imagen: `main.ts` (API HTTP), `worker.ts` (jobs y
  despachador del outbox) y `migrate.ts` (migraciones y semillas).
- **Módulos con fronteras duras**: cada módulo expone solo su `index.ts`; dependency-cruiser lo verifica en CI
  (`tests/architecture/`), con fixtures que prueban que cada regla detecta su violación.
- **Un esquema y un rol de PostgreSQL por módulo**, un pool por módulo, sin llaves foráneas entre esquemas. Un
  módulo no puede leer las tablas de otro ni siquiera por error: la base de datos lo impide.
- **Una transacción por módulo.** La coordinación entre módulos se hace por API pública idempotente o por
  eventos con outbox/inbox transaccionales.
- **Dominio puro** (`domain/` sin Nest ni Kysely), para que las reglas de negocio se prueben sin infraestructura
  y sobrevivan a un cambio de framework.
- **Kysely** (SQL tipado, sin ORM) y migraciones SQL planas: el modelo de datos es explícito y portable.

Versiones elegidas (vigentes al 2026-10-24, verificadas en el registro):

| Pieza      | Versión | Nota                                                                       |
| ---------- | ------- | -------------------------------------------------------------------------- |
| Node.js    | 24.22.1 | LTS vigente; Node 26 pasa a LTS el 2026-10-28 (evaluar migración).         |
| pnpm       | 12.15.0 | Reescrito en Rust; la política de seguridad vive en `pnpm-workspace.yaml`. |
| TypeScript | 6.0.3   | TS 7 no es compatible con typescript-eslint (exige `<6.1`).                |
| NestJS     | 12.x    | Solo ESM: la API es `"type": "module"` con `module: nodenext`.             |
| Vitest     | 5.x     | Vite 8 (oxc) emite `design:paramtypes`; no hace falta SWC.                 |
| PostgreSQL | 18.6    | 19 aún está en RC. Imagen fijada por tag y digest.                         |

## Consecuencias

- Más ceremonia por módulo (roles, pools, `index.ts`, eventos) a cambio de poder extraer un módulo o
  conectarlo a un ERP externo sin reescribir los demás.
- Las consultas que cruzan módulos se componen en código (por ejemplo, `planning` combina inventory, product y
  sales por sus API públicas), no con JOIN entre esquemas.
- La consistencia entre módulos es eventual cuando hay eventos; dentro de un módulo es transaccional.
