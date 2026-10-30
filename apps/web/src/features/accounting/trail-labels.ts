import type { Entity } from '../../app/access';

/** What each trail action means, as a verb the auditor reads ("Facturó", "Despachó"…). */
export const ACTION_LABELS: Partial<Record<string, string>> = {
  created: 'Creó',
  submitted: 'Envió',
  prioritized: 'Priorizó',
  invoiced: 'Facturó',
  ready: 'Alistó',
  dispatched: 'Despachó',
  delivered: 'Entregó',
  cancelled: 'Anuló',
  closed: 'Cerró',
  collected: 'Recibo de caja',
  paid: 'Comprobante de egreso',
  received: 'Recibió',
  receive: 'Recibió',
  complete: 'Terminó',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** The page each kind of document opens. */
export const ENTITY_LINKS: Partial<Record<string, Entity>> = {
  sales_order: 'order',
  purchase_order: 'purchase-order',
  shipment: 'shipment',
  production_order: 'production-order',
  invoice: 'invoice',
};

/** Document kinds of the trail, with the names the screens use. */
export const ENTITY_TYPES: readonly { value: string; label: string }[] = [
  { value: 'sales_order', label: 'Pedidos' },
  { value: 'invoice', label: 'Facturas de venta' },
  { value: 'shipment', label: 'Remisiones' },
  { value: 'purchase_order', label: 'Órdenes de compra' },
  { value: 'production_order', label: 'Órdenes de producción' },
];

/** Singular name of a document kind in the trail ("Pedido", "Remisión"). */
export const ENTITY_NAMES: Partial<Record<string, string>> = {
  sales_order: 'Pedido',
  invoice: 'Factura de venta',
  shipment: 'Remisión',
  purchase_order: 'Orden de compra',
  production_order: 'Orden de producción',
};
