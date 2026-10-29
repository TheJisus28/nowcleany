import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { PurchaseOrdersRepository } from '../orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from '../orders/purchase-orders.service.js';
import { SupplierDirectory } from './supplier-directory.js';

// DATOS DE EJEMPLO (proveedores inventados): compras recibidas hoy, en camino (una atrasada) y una anulada
// porque el proveedor no tenía; el alcohol sigue faltando y compras lo ve.
type Outcome = 'open' | 'received-today' | 'cancelled';

const ORDERS: readonly {
  supplier: string;
  inDays: number;
  outcome: Outcome;
  lines: readonly (readonly [code: string, quantity: string])[];
  notes?: string;
}[] = [
  {
    supplier: 'Químicos del Caribe S.A.S.',
    inDays: 0,
    outcome: 'received-today',
    lines: [
      ['MP-LAURIL', '500'],
      ['MP-SAL', '200'],
    ],
  },
  {
    supplier: 'Plásticos del Sinú S.A.S.',
    inDays: 0,
    outcome: 'received-today',
    lines: [['MP-ENV-500', '2000']],
  },
  {
    supplier: 'Plásticos del Sinú S.A.S.',
    inDays: -2,
    outcome: 'open',
    lines: [
      ['MP-GALON', '600'],
      ['MP-TAPA-38', '600'],
    ],
    notes: 'Confirmaron despacho desde Barranquilla.',
  },
  {
    supplier: 'Químicos Industriales de la Costa',
    inDays: 3,
    outcome: 'open',
    lines: [
      ['MP-ESTER', '400'],
      ['MP-QUAT', '40'],
    ],
  },
  {
    supplier: 'Litografía Montería',
    inDays: 6,
    outcome: 'open',
    lines: [
      ['MP-ETQ-VID', '1000'],
      ['MP-ETQ-FABG', '500'],
    ],
  },
  {
    supplier: 'Solventes y Alcoholes del Norte',
    inDays: 4,
    outcome: 'cancelled',
    lines: [['MP-ALCOHOL', '200']],
    notes: 'El proveedor no tiene existencias este mes.',
  },
];

@Injectable()
export class ShowcasePurchasesSeeder {
  private readonly logger = new Logger('purchasing');

  constructor(
    private readonly catalog: ProductCatalog,
    private readonly orders: PurchaseOrdersService,
    private readonly repository: PurchaseOrdersRepository,
    private readonly suppliers: SupplierDirectory,
  ) {}

  async seed(): Promise<void> {
    if ((await this.repository.list({ limit: 2 })).length > 1) return;
    const products = new Map(
      (await this.catalog.findByCodes(ORDERS.flatMap((o) => o.lines.map(([code]) => code)))).map(
        (p) => [p.code, p.id],
      ),
    );
    for (const order of ORDERS) {
      const created = await this.orders.create({
        supplierId: await this.suppliers.idOf(order.supplier),
        expectedDate: inDays(order.inDays),
        ...(order.notes ? { notes: order.notes } : {}),
        lines: order.lines.map(([code, quantity]) => ({
          productId: products.get(code) ?? '',
          quantity,
        })),
      });
      if (order.outcome === 'received-today')
        await this.orders.receive(created.id, {
          document: `FE-${String(4100 + ORDERS.indexOf(order))}`,
        });
      if (order.outcome === 'cancelled') await this.orders.cancel(created.id);
    }
    this.logger.log(`Órdenes de compra adicionales: ${String(ORDERS.length)}`);
  }
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
