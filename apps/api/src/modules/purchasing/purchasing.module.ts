import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingBook } from './book/purchasing-book.js';
import { PurchaseOrdersController } from './orders/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from './orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from './orders/purchase-orders.service.js';
import { PurchasePlansController } from './plan/purchase-plans.controller.js';
import { PurchasePlansRepository } from './plan/purchase-plans.repository.js';
import { PurchasePlansService } from './plan/purchase-plans.service.js';
import { SupplierInvoicesController } from './receipts/supplier-invoices.controller.js';
import { SupplierInvoicesRepository } from './receipts/supplier-invoices.repository.js';
import { SupplierInvoicesService } from './receipts/supplier-invoices.service.js';
import { SupplierDirectory } from './seeds/supplier-directory.js';
import { SuppliersController } from './suppliers/suppliers.controller.js';
import { SuppliersRepository } from './suppliers/suppliers.repository.js';
import { SuppliersService } from './suppliers/suppliers.service.js';

@Module({
  imports: [ProductModule, InventoryModule, AuditModule],
  controllers: [
    PurchaseOrdersController,
    SupplierInvoicesController,
    PurchasePlansController,
    SuppliersController,
  ],
  providers: [
    PurchaseOrdersService,
    PurchaseOrdersRepository,
    SupplierInvoicesService,
    SupplierInvoicesRepository,
    PurchasePlansService,
    PurchasePlansRepository,
    SuppliersService,
    SuppliersRepository,
    PurchasingBook,
    SupplierDirectory,
  ],
  exports: [
    PurchasingBook,
    PurchaseOrdersService,
    SupplierInvoicesService,
    PurchasePlansService,
    SupplierDirectory,
  ],
})
export class PurchasingModule {}
