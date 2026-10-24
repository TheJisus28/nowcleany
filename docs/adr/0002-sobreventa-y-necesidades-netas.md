# ADR 0002 — Sobreventa permitida y planeación por necesidades netas

- Estado: propuesto (confirmar en la revisión de M0)
- Fecha: 2026-10-24

## Contexto

El brief inicial pedía que ventas no pudiera confirmar un pedido imposible de cumplir. El cliente aclaró que
el problema real es otro: el "teléfono roto" entre ventas y planta. Siempre se sobrevende (y eso es válido),
pero planta se queda sin insumos y compras sale a comprar a última hora. No quieren sobreinventario de
materias primas porque afecta los márgenes.

## Decisión

- Confirmar un pedido **nunca falla por stock**. Se reserva el producto terminado por pedido y el disponible
  (`onHand - reserved`) puede quedar negativo. Se elimina el `CHECK (reservado <= físico)` del brief inicial.
- Un módulo `planning`, de solo lectura, calcula las necesidades netas en cada consulta, sin guardar copias:
  - producción: `toManufacture = max(0, reserved - onHand)` por producto terminado;
  - compras: `toBuy = max(0, Σ requirements(fórmula vigente, toManufacture) - onHand)` por materia prima.
- No hay stock de seguridad ni punto de reorden: la sugerencia de compra es exactamente el faltante.
- Planta registra la producción (entra terminado, salen materias primas según la fórmula vigente) y compras
  registra las entradas; las necesidades se recalculan solas.

## Consecuencias

- La prueba de concurrencia cambia: 20 confirmaciones simultáneas sobre un stock de 10 deben confirmarse
  todas, con `reserved` igual a la suma exacta (sin actualizaciones perdidas) y el saldo igual a la suma del
  libro de movimientos.
- Calcular las necesidades al vuelo evita estados derivados que se desincronizan. Si el volumen crece, se puede
  materializar en el futuro sin cambiar la API.
- Las compras en tránsito (ya pedidas, no recibidas) no se descuentan: ver `docs/preguntas-abiertas.md`.
