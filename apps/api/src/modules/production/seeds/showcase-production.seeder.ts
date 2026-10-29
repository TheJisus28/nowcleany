import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { ProductionOrdersRepository } from '../orders/production-orders.repository.js';
import { ProductionOrdersService } from '../orders/production-orders.service.js';

// DATOS DE EJEMPLO: lo que planta envasó hoy (para los despachos del día), lo que tiene programado
// (un bache atrasado) y una orden anulada por falta de insumos.
type Outcome = 'planned' | 'completed-today' | 'cancelled';

const ORDERS: readonly {
  code: string;
  quantity: string;
  inDays: number;
  outcome: Outcome;
  notes?: string;
  /** Liters of bulk left in the tank after packaging. */
  bulkWaste?: string;
}[] = [
  {
    code: '00411',
    quantity: '120',
    inDays: 0,
    outcome: 'completed-today',
    bulkWaste: '6.5',
    notes: 'Turno de la mañana.',
  },
  {
    code: '00611',
    quantity: '200',
    inDays: 0,
    outcome: 'completed-today',
    bulkWaste: '4',
    notes: 'Turno de la mañana.',
  },
  {
    code: 'GR-DET',
    quantity: '8000',
    inDays: -2,
    outcome: 'planned',
    notes: 'Se corrió por mantenimiento del tanque 3.',
  },
  { code: 'GR-SUAV', quantity: '5000', inDays: 1, outcome: 'planned' },
  { code: '00410', quantity: '300', inDays: 2, outcome: 'planned' },
  { code: '00226', quantity: '200', inDays: 3, outcome: 'planned' },
  {
    code: '00510',
    quantity: '100',
    inDays: 1,
    outcome: 'cancelled',
    notes: 'Sin butilglicol para el granel.',
  },
];

@Injectable()
export class ShowcaseProductionSeeder {
  private readonly logger = new Logger('production');

  constructor(
    private readonly catalog: ProductCatalog,
    private readonly orders: ProductionOrdersService,
    private readonly repository: ProductionOrdersRepository,
  ) {}

  async seed(): Promise<void> {
    if ((await this.repository.list({ limit: 2 })).length > 1) return;
    const products = new Map(
      (await this.catalog.findByCodes(ORDERS.map((o) => o.code))).map((p) => [p.code, p.id]),
    );
    for (const order of ORDERS) {
      const created = await this.orders.create({
        productId: products.get(order.code) ?? '',
        quantity: order.quantity,
        scheduledDate: inDays(order.inDays),
        ...(order.notes ? { notes: order.notes } : {}),
      });
      if (order.outcome === 'completed-today')
        await this.orders.complete(created.id, {
          ...(order.bulkWaste ? { bulkWaste: order.bulkWaste } : {}),
        });
      if (order.outcome === 'cancelled') await this.orders.cancel(created.id);
    }
    this.logger.log(`Órdenes de producción adicionales: ${String(ORDERS.length)}`);
  }
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
