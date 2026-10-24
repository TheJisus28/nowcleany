import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { KyselyProductionOrdersRepository } from './orders/kysely-production-orders.repository.js';
import { ProductionOrdersController } from './orders/production-orders.controller.js';
import { ProductionOrdersRepository } from './orders/production-orders.repository.js';
import { ProductionOrdersService } from './orders/production-orders.service.js';
import { ProductionPermissions } from './permissions.js';
import { ProductionSchedule } from './schedule/production-schedule.js';
import { DemoProductionSeeder } from './seeds/demo-production.seeder.js';

@Module({
  imports: [DatabaseModule.forModule('production'), ProductModule, InventoryModule],
  controllers: [ProductionOrdersController],
  providers: [
    ProductionPermissions,
    ProductionOrdersService,
    ProductionSchedule,
    DemoProductionSeeder,
    { provide: ProductionOrdersRepository, useClass: KyselyProductionOrdersRepository },
  ],
  exports: [ProductionSchedule],
})
export class ProductionModule {}
