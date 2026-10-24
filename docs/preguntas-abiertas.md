# Preguntas abiertas

Cada punto tiene el default que se está usando mientras no haya respuesta.

## Negocio

| #   | Pregunta                                                                                  | Default actual                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| N1  | ¿El inventario **físico** puede quedar negativo (despachar antes de reportar producción)? | Sí; se permite y los paneles lo resaltan. El disponible negativo (sobreventa) siempre se permite.  |
| N2  | ¿Los pedidos en borrador cuentan para planear producción y compras?                       | No; solo los confirmados. Los borradores se muestran aparte como demanda potencial.                |
| N3  | Compras en tránsito (pedidas al proveedor, sin recibir): ¿se descuentan del faltante?     | No (no hay módulo de compras). El faltante sigue hasta registrar la entrada. Riesgo: compra doble. |
| N4  | Presentaciones y mínimos del proveedor (p. ej. tambor de 200 L)                           | Fuera del MVP; se sugiere la cantidad exacta faltante.                                             |
| N5  | ¿Fecha de entrega comprometida en el pedido, para priorizar producción y compras?         | No incluida (no estaba en el brief). Recomendado agregarla como campo opcional.                    |
| N6  | ¿Se fabrica en lotes completos o en la cantidad exacta?                                   | Cantidad exacta (proporcional), como en el caso del cloro.                                         |
| N7  | "Producible" cuando dos productos compiten por la misma materia prima                     | Se calcula por producto, de forma independiente.                                                   |
| N8  | Planta: ¿registrar producción descuenta materias primas automáticamente según la fórmula? | Sí, en una sola transacción de inventario.                                                         |

## Técnicas

| #   | Pregunta                                                   | Default actual                                                                      |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T1  | Idioma de rutas HTTP, campos JSON, enums, permisos y roles | Inglés (son código). Español en mensajes, textos de UI y nombres visibles.          |
| T2  | Idioma de los mensajes de log                              | Español; las claves estructuradas (requestId, actorId, module) en inglés.           |
| T3  | Node 26 pasa a LTS el 2026-10-28                           | Se fija Node 24.22.1 (LTS hoy). Evaluar migración después.                          |
| T4  | GitHub Actions fijadas por tag (`@v5`), no por SHA         | Sin red hacia GitHub no se pueden resolver SHAs; fijarlas por SHA al subir el repo. |
| T5  | Dependabot vs Renovate                                     | Dependabot (sin app externa). Verificar que soporte el lockfile de pnpm 12.         |
| T6  | Swagger UI sobre Fastify requiere `@fastify/static` (peer) | Se agrega en M1 como consecuencia del stack fijado (@nestjs/swagger + Fastify).     |
| T7  | `minimumReleaseAge`                                        | 1 día (el default de pnpm, explícito). Subirlo a 3–7 días si se quiere más margen.  |
| T8  | Tailwind en el frontend                                    | Agregado al stack por pedido del cliente.                                           |
