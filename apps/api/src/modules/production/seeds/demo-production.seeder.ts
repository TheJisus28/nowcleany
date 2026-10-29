import { Injectable, Logger } from '@nestjs/common';
import { ProductCatalog } from '../../product/index.js';
import { ProductionOrdersRepository } from '../orders/production-orders.repository.js';
import { ProductionOrdersService } from '../orders/production-orders.service.js';

/** DATOS DE EJEMPLO: planta ya programó parte del envasado de limpiapisos. */
@Injectable()
export class DemoProductionSeeder {
  private readonly logger = new Logger('production');

  constructor(
    private readonly catalog: ProductCatalog,
    private readonly orders: ProductionOrdersService,
    private readonly repository: ProductionOrdersRepository,
  ) {}

  async seed(): Promise<void> {
    if ((await this.repository.list({ limit: 1 })).length > 0) return;
    const [gallon] = await this.catalog.findByCodes(['00310']);
    if (!gallon) return;
    const scheduled = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await this.orders.create({
      productId: gallon.id,
      quantity: '200',
      scheduledDate: scheduled,
      notes: 'Primer turno de envasado (datos de ejemplo).',
    });
    this.logger.log('Orden de producción de demo creada');
  }
}
