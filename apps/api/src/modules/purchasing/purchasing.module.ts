import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingBook } from './book/purchasing-book.js';
import { PurchaseOrdersController } from './orders/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from './orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from './orders/purchase-orders.service.js';
import { SupplierDirectory } from './seeds/supplier-directory.js';
import { SuppliersController } from './suppliers/suppliers.controller.js';
import { SuppliersRepository } from './suppliers/suppliers.repository.js';
import { SuppliersService } from './suppliers/suppliers.service.js';
import { DemoPurchasesSeeder } from './seeds/demo-purchases.seeder.js';
import { ShowcasePurchasesSeeder } from './seeds/showcase-purchases.seeder.js';

@Module({
  imports: [ProductModule, InventoryModule],
  controllers: [PurchaseOrdersController, SuppliersController],
  providers: [
    PurchaseOrdersService,
    PurchasingBook,
    DemoPurchasesSeeder,
    ShowcasePurchasesSeeder,
    PurchaseOrdersRepository,
    SuppliersService,
    SuppliersRepository,
    SupplierDirectory,
  ],
  exports: [PurchasingBook],
})
export class PurchasingModule {}
