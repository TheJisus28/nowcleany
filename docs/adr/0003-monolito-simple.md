# ADR 0003 — Monolito simple para la demo

Fecha: 2026-10-29 · Estado: aceptada · Reemplaza a: ADR 0001 (monolito modular)

## Contexto

SCIP se va a presentar a NOW CLEANY como demo y se quiere iterar rápido sobre lo que ya funciona. La
arquitectura de la ADR 0001 (un esquema, un rol y un pool por módulo, outbox con worker, reglas de
dependency-cruiser, pruebas con Testcontainers) protege bien un sistema que crece, pero en esta etapa hace
más lento cada cambio y obliga a correr un proceso extra (el worker).

## Decisión

- Un solo esquema (`apps/api/src/platform/db/schema.sql`), una conexión y `@Transactional()` por operación.
  Lo que antes eran dos transacciones (preventa e inventario) ahora es una.
- Sin outbox, inbox, worker ni tareas programadas: anular una preventa libera la reserva en la misma
  transacción; confirmar ya no necesita dos fases.
- Repositorios concretos (sin clase abstracta como token). Los módulos se usan por sus servicios.
- Roles y permisos en código (`modules/identity/access.ts`), no en tablas sincronizadas.
- Semillas explícitas y en orden (`apps/api/src/seed.ts`).
- Sin pruebas automáticas ni dependency-cruiser por ahora: se verifica con lint, tipos y pantallazos.

Se mantiene todo el comportamiento: mismas rutas y JSON, permisos por ruta, cuatro ojos en fórmulas,
cantidades exactas en `bigint`, errores `problem+json` y los cálculos de planeación.

## Consecuencias

- Menos código y un proceso menos; cambios más rápidos.
- Si SCIP pasa a producción o crece hacia un ERP, conviene volver a separar responsabilidades por módulo y
  recuperar la suite de pruebas (la versión anterior está en el historial de git, antes de este cambio).
