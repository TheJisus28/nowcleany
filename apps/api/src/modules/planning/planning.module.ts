import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { ProductionModule } from '../production/index.js';
import { PurchasingModule } from '../purchasing/index.js';
import { SalesModule } from '../sales/index.js';
import { PlanningController } from './planning/planning.controller.js';
import { PlanningService } from './planning/planning.service.js';

/** No schema of its own: it only composes the public APIs of the other modules. */
@Module({
  imports: [ProductModule, InventoryModule, SalesModule, ProductionModule, PurchasingModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
