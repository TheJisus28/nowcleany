# ADR 0002 — Sobreventa permitida y planeación por necesidades netas multinivel

- Estado: aceptado
- Fecha: 2026-10-24

## Contexto

El brief inicial pedía que ventas no pudiera confirmar un pedido imposible de cumplir. El cliente aclaró que
el problema real es el "teléfono roto" entre ventas, planta y compras (ver `docs/alcance-scip.md`). La
sobreventa es válida, el inventario físico puede quedar negativo y prefieren salir a comprar antes que tener
inventario quieto. La planta trabaja en dos niveles: granel (litros, por bache o fraccionado) y envasado.

## Decisión

- Confirmar una preventa **nunca falla por stock**. Se reserva el terminado por pedido; disponible y físico
  pueden quedar negativos. Se elimina el `CHECK (reservado <= físico)` y la prueba de "nunca reservar de más".
- Las fórmulas son de dos niveles: `FINISHED_GOOD` → `BULK` + empaque; `BULK` → químicos.
- `planning`, de solo lectura, calcula las necesidades netas en cada consulta, sin guardar copias:
  1. terminado: `toPack = max(0, reserved - onHand)`;
  2. granel: requerido por `toPack` (agregado entre presentaciones) menos físico → `toProduce`; la producción
     ya planeada se muestra contra esa cifra;
  3. materias primas: requerido por `toProduce` y por el empaque de `toPack`, menos físico y menos lo que está
     en tránsito (órdenes de compra abiertas) → `toBuy`.
- No hay stock de seguridad ni punto de reorden: `toBuy` es exactamente el faltante neto.
- Compras en tránsito: orden de compra mínima (`OPEN → RECEIVED | CANCELLED`). Sin ella, apenas compras
  compra, su panel seguiría pidiendo comprar y reaparece el teléfono roto.

## Consecuencias

- La prueba de concurrencia pasa a ser: 20 confirmaciones simultáneas sobre un stock de 10 se confirman todas,
  con `reserved` igual a la suma exacta (sin actualizaciones perdidas) y el saldo igual a la suma del libro.
- La "capacidad" por producto se calcula de forma independiente; si dos presentaciones compiten por la misma
  materia prima, la suma de capacidades puede superar lo realmente fabricable. Las cifras de compra no se
  afectan porque salen de la explosión agregada.
- Calcular al vuelo evita estados derivados desincronizados; si el volumen crece se puede materializar sin
  cambiar la API.
