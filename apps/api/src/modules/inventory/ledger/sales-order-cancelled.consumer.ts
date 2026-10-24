import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope } from '../../../platform/outbox/event.js';
import { EventConsumer } from '../../../platform/outbox/event-consumer.js';
import { StockService } from '../stock/stock.service.js';

/** A cancelled sales order no longer commits stock: its reservations are released (idempotent via inbox). */
@Injectable()
export class SalesOrderCancelledConsumer {
  private readonly logger = new Logger('inventory');

  constructor(private readonly stock: StockService) {}

  @EventConsumer({
    event: 'SalesOrderCancelled',
    module: 'inventory',
    name: 'inventory.release-cancelled-order',
    permissions: ['inventory:reserve'],
  })
  async handle(event: EventEnvelope): Promise<void> {
    const orderId = event.payload['orderId'];
    if (typeof orderId !== 'string') throw new Error(`Evento ${event.id} sin orderId`);
    const { released } = await this.stock.release(orderId);
    this.logger.log(
      released
        ? `Reservas liberadas del pedido anulado ${orderId}`
        : `El pedido anulado ${orderId} no tenía reservas`,
    );
  }
}
