# Alcance funcional — SCIP (NOW CLEANY S.A.S.)

Resumen de la propuesta comercial "SCIP – Sistema de Control Inteligente de Inventario y Producción" y cómo
se traduce a módulos. Es la referencia de alcance del MVP.

## Problema

Las ventas en preventa no se cruzan, en el momento, con las materias primas disponibles en planta. Producción
y Compras se enteran tarde de lo que falta; la compra se hace de urgencia o el pedido sale incompleto.

Ejemplo de la propuesta (cifras ilustrativas; se replican en las semillas de demo):

| Concepto       | Vendedor A | Vendedor B | Vendedor C | Total vendido | Capacidad con MP disponible | Sin cobertura |
| -------------- | ---------: | ---------: | ---------: | ------------: | --------------------------: | ------------: |
| Cajas de cloro |      1.200 |        800 |        950 |         2.950 |                       2.000 |           950 |

El reporte de sobreventa debe mostrar de inmediato las 950 cajas sin cobertura y cuántos litros de químicos,
envases, tapas, etiquetas y cajas hay que comprar para cubrirlas.

Reglas del cliente: la sobreventa es válida y el inventario físico puede quedar negativo; prefieren salir a
comprar que tener inventario quieto. Nunca sobreinventario.

## Flujo de planta → módulos

| Etapa de la propuesta                         | Módulo                    | Operación                                                                 |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Maestros y fórmulas (por litro y por bache)   | `product`                 | Materias primas, granel, terminados; fórmulas versionadas en dos niveles. |
| Carga inicial por archivo plano               | `product`, `inventory`    | CSV de productos y CSV de saldos iniciales (sin integración ERP).         |
| Preventa                                      | `sales`                   | Pedido con cliente, vendedor, fecha estimada de entrega y líneas.         |
| Recepción de materias primas                  | `purchasing`, `inventory` | Orden de compra simple (en tránsito) → recepción con cantidad y fecha.    |
| Producción en baches (por bache o por litros) | `production`              | Orden de producción de granel; al completarla descuenta los químicos.     |
| Envasado y alistamiento                       | `production`              | Orden de envasado: entra terminado, salen granel y material de empaque.   |
| Entrega a despacho                            | `inventory`               | Traslado de terminado de bodega PLANTA a bodega DESPACHO.                 |
| Despacho al cliente                           | `sales`, `inventory`      | Despacho del pedido: sale de DESPACHO y consume la reserva.               |
| Reporte de sobreventa                         | `planning`                | Vendido vs. capacidad; faltante por terminado y por materia prima.        |
| Consulta de inventario (kardex)               | `inventory`               | Existencias y movimientos con saldo acumulado, en tiempo real.            |

## Paneles

- **Ventas**: sus preventas, estado de cobertura de cada pedido, total por vendedor.
- **Planta**: qué producir (granel, en litros y baches) y qué envasar, según los pedidos; órdenes en curso.
- **Compras**: qué comprar por materia prima (faltante neto de lo que ya está en tránsito); órdenes abiertas.
- **Inventario/Bodega**: existencias por bodega, kardex, recepciones, traslados, ajustes, carga inicial.
- **Gerencia/Admin**: reporte de sobreventa, maestros, fórmulas y usuarios.

## Fuera de esta fase

Varias plantas, lotes y vencimientos, costos y precios, facturación electrónica, integración con el ERP o el
sistema contable, WhatsApp, modo offline, recepciones parciales, ficha de proveedores.
