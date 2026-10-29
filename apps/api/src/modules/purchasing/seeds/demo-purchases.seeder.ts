import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { PurchaseOrdersRepository } from '../orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from '../orders/purchase-orders.service.js';

/** DATOS DE EJEMPLO: compras ya pidió 300 cajas corrugadas; el panel las descuenta del faltante. */
@Injectable()
export class DemoPurchasesSeeder {
  private readonly logger = new Logger('purchasing');

  constructor(
    private readonly catalog: ProductCatalog,
    private readonly orders: PurchaseOrdersService,
    private readonly repository: PurchaseOrdersRepository,
  ) {}

  async seed(): Promise<void> {
    if ((await this.repository.list({ limit: 1 })).length > 0) return;
    const [boxes] = await this.catalog.findByCodes(['MP-CAJA-6']);
    if (!boxes) return;
    await this.orders.create({
      supplier: 'Cartones de Córdoba SAS',
      expectedDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      notes: 'Pedido por teléfono (datos de ejemplo).',
      lines: [{ productId: boxes.id, quantity: '300' }],
    });
    this.logger.log('Orden de compra de demo creada');
  }
}
