---
name: erp-operativo
description: Convenciones de UX de los sistemas administrativos tradicionales (ERP) para el panel de SCIP en apps/web. Usar al crear o modificar cualquier pantalla del panel: documentos con encabezado, detalle y totales; consultas en grilla con filtros, totales, exportar e imprimir; menú por módulo (Documentos, Consultas, Informes, Maestros); captura por teclado; formatos imprimibles; inicio multiactor.
---

# UX de ERP tradicional para SCIP

Quienes usarán SCIP (consolidado, compras, recepción, planta, logística, contabilidad) vienen de un sistema
administrativo tradicional. Reconocen **documentos, consultas, informes y maestros**; las bandejas con tarjetas,
los asistentes paso a paso y los diálogos para capturar documentos completos les resultan extraños. La identidad
visual (tokens de `src/styles.css`) se mantiene: lo que cambia es la forma de trabajar.

## 1. Menú por módulo

Cada módulo agrupa sus opciones siempre en el mismo orden y con estos rótulos:

- **Documentos**: lo que se registra y autoriza (pedido, factura, orden de compra, entrada de almacén, remisión…).
- **Consultas**: lo que se busca y se trabaja en lote (pedidos por estado, existencias, kárdex, cartera…).
- **Informes**: lo que se analiza e imprime (tablero de operación, sobreventa, cobros y pagos, ventas).
- **Maestros**: lo que se configura (clientes, productos y fórmulas, proveedores, usuarios).

Vocabulario del medio colombiano (úsalo en menús, títulos y botones):

| Concepto en el código        | En pantalla                                 |
| ---------------------------- | ------------------------------------------- |
| sales order                  | Pedido (preventa mientras está en borrador) |
| invoice                      | Factura de venta                            |
| customer payment             | Recibo de caja                              |
| receivables                  | Cartera (cuentas por cobrar)                |
| shipment                     | Remisión / guía de despacho                 |
| purchase order               | Orden de compra                             |
| supplier invoice (receiving) | Entrada de almacén (con factura de compra)  |
| supplier payment             | Comprobante de egreso                       |
| payables                     | Cuentas por pagar                           |
| customer portfolio (seller)  | Clientes asignados (no "cartera")           |
| trail                        | Auditoría (traza)                           |

## 2. Pantalla de documento

Un documento se registra en **una sola pantalla**, nunca en un diálogo ni en pasos:

1. **Barra de herramientas fija arriba** con texto y atajo: Nuevo, Guardar (Ctrl+S), el paso del rol
   (Enviar, Facturar, Alistar, Despachar, Autorizar…), Anular, Imprimir (Ctrl+P), Buscar (F3), anterior ◀ y
   siguiente ▶ entre documentos del mismo tipo, Cerrar (Esc). Un solo botón primario: el paso del rol.
2. **Encabezado** en una rejilla compacta de campos con la etiqueta visible: número consecutivo (solo lectura,
   grande), fecha, estado, tercero (NIT o cédula + nombre, búsqueda con F2), sucursal, vendedor, fechas.
3. **Detalle** en una grilla tipo hoja: Código · Descripción · Unidad · Cantidad · Precio · Valor. Al escribir el
   código y pulsar Enter se completa la descripción; Enter salta al siguiente campo; al terminar la última fila se
   agrega otra; Supr borra la fila. En consulta (documento ya guardado) la grilla es de solo lectura.
4. **Pie**: observaciones a la izquierda; totales a la derecha (subtotal, IVA, total), alineados por decimales.
5. **Firma**: "Elaboró / Autorizó / Fecha" en el pie o el encabezado, alimentado por la traza.

## 3. Consultas

- Franja de **filtros arriba**: desde / hasta, tercero, estado, bodega… y el botón **Consultar**. Los filtros se
  reflejan en la URL.
- **Grilla densa**: filas de 32–36 px, encabezados que ordenan, números a la derecha con separador de miles,
  **fila de totales** al pie y contador de registros.
- **Exportar** a Excel (CSV con `;`) e **Imprimir** en la misma franja.
- **Doble clic o Enter** sobre una fila abre el documento. Casillas de selección cuando hay acción en lote
  (facturar pedidos, armar remisión, pagar facturas), con la acción en la barra superior.
- Encabezados fijos (sticky), **paginación** clara (nunca scroll infinito: en auditoría se cita "página 3, fila
  12") y menú **Columnas** para ocultar o reordenar columnas; la elección se recuerda por usuario y consulta.
- En móvil o tableta la grilla se vuelve lista; en escritorio nada de tarjetas.

## 4. Informes

Encabezado con la empresa, el nombre del informe, el rango y la fecha de generación; tablas antes que gráficos;
los gráficos acompañan, no reemplazan. Todo informe se puede imprimir.

## 5. Teclado

Tab / Enter avanzan, Shift+Tab retrocede, F2 busca en el campo actual, F3 busca documentos, Ctrl+S guarda,
Ctrl+P imprime, Esc cierra o vuelve, flechas recorren las grillas. Los atajos se muestran en los botones.

## 6. Captura sin pérdidas ni errores

- **Valores por defecto inteligentes**: fecha de hoy, bodega habitual del rol, vendedor dueño del cliente,
  sucursal principal, costo de la orden de compra, saldo pendiente como valor del pago.
- **Borrador automático**: lo que se lleva escrito en un documento sin guardar se conserva (por documento y
  usuario) si se cierra la pestaña o la sesión; al volver se ofrece recuperarlo.
- **Validación al salir del campo** (no solo al guardar), con el error junto al campo y en lenguaje de negocio:
  "De 00224 quedan 300 und por despachar", no códigos técnicos.
- **Confirmación doble** para lo irreversible (anular un pedido, cerrar una orden con faltante, facturar con
  pendiente), diciendo qué pasará.

## 7. Navegación entre tareas

- **Búsqueda global** (Ctrl+K o F3): encuentra menús y documentos por número o tercero ("FV-00102",
  "OC-00045", "La Economía").
- **Pestañas de trabajo** en la barra superior: cada documento o consulta abierta queda como pestaña para
  saltar entre tareas (revisar existencias mientras se llena una orden de compra) y volver sin perder lo
  escrito (con el borrador automático). Se cierran con la ✕ o con la rueda del ratón, y se pueden cerrar
  todas: nunca se obliga a tener una abierta.
- **Sin ruta de migas (breadcrumb)**: la pestaña activa y la opción marcada en el menú ya dicen dónde se está.
- El menú solo muestra lo que el rol usa.

## 8. Inicio

- **Gerencia** entra al **tablero de la operación**: todos los actores y cuántos documentos hay en cada paso del
  flujo (por consolidar, por alistar, por despachar, en ruta, por recibir, cartera vencida…), con su antigüedad y
  valor. La sobreventa es un informe más, no la portada.
- **Cada usuario operativo** entra a **Pendientes**: una consulta (grilla) de los documentos que esperan su paso,
  con el botón de ese paso. No tarjetas.
- El tablero de gerencia es **configurable**: cada gerente elige qué bloques ve y en qué orden (se recuerda).

## 9. Evitar

Tarjetas como contenedor de listas, asistentes, diálogos que capturan documentos completos, iconos sin texto,
acciones escondidas en hover, scroll infinito, textos promocionales. Los diálogos quedan para confirmar
(anular, facturar con pendiente) o para datos cortos (quién recibió).

## 10. Componentes del proyecto

Usa `src/components/erp/*` (barra de documento, encabezado, grilla de líneas, consulta paginada con columnas,
búsqueda F2, borrador automático, pestañas de trabajo, impresión) en
vez de componer pantallas nuevas desde cero.
