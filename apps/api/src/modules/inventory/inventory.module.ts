import { Module } from '@nestjs/common';
import { ProductModule } from '../product/index.js';
import { InventoryLedger } from './ledger/inventory-ledger.js';
import { StockController } from './stock/stock.controller.js';
import { StockRepository } from './stock/stock.repository.js';
import { StockService } from './stock/stock.service.js';
import { DemoStockSeeder } from './seeds/demo-stock.seeder.js';
import { ShowcaseStockSeeder } from './seeds/showcase-stock.seeder.js';

@Module({
  imports: [ProductModule],
  controllers: [StockController],
  providers: [StockService, InventoryLedger, DemoStockSeeder, ShowcaseStockSeeder, StockRepository],
  exports: [InventoryLedger],
})
export class InventoryModule {}
