import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { ProductModule } from '../product/index.js';
import { InventoryLedger } from './ledger/inventory-ledger.js';
import { SalesOrderCancelledConsumer } from './ledger/sales-order-cancelled.consumer.js';
import { InventoryPermissions } from './permissions.js';
import { KyselyStockRepository } from './stock/kysely-stock.repository.js';
import { StockController } from './stock/stock.controller.js';
import { StockRepository } from './stock/stock.repository.js';
import { StockService } from './stock/stock.service.js';

@Module({
  imports: [DatabaseModule.forModule('inventory'), ProductModule],
  controllers: [StockController],
  providers: [
    InventoryPermissions,
    StockService,
    InventoryLedger,
    SalesOrderCancelledConsumer,
    { provide: StockRepository, useClass: KyselyStockRepository },
  ],
  exports: [InventoryLedger],
})
export class InventoryModule {}
