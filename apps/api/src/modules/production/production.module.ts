import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { ProductionOrdersController } from './orders/production-orders.controller.js';
import { ProductionOrdersRepository } from './orders/production-orders.repository.js';
import { ProductionOrdersService } from './orders/production-orders.service.js';
import { ProductionSchedule } from './schedule/production-schedule.js';
import { DemoProductionSeeder } from './seeds/demo-production.seeder.js';
import { ShowcaseProductionSeeder } from './seeds/showcase-production.seeder.js';

@Module({
  imports: [ProductModule, InventoryModule],
  controllers: [ProductionOrdersController],
  providers: [
    ProductionOrdersService,
    ProductionSchedule,
    DemoProductionSeeder,
    ShowcaseProductionSeeder,
    ProductionOrdersRepository,
  ],
  exports: [ProductionSchedule],
})
export class ProductionModule {}
