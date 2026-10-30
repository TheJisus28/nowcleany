import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { PlanningModule } from '../planning/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingModule } from '../purchasing/index.js';
import { SalesModule } from '../sales/index.js';
import { FinanceController } from './finance/finance.controller.js';
import { FinanceService } from './finance/finance.service.js';
import { InvoicesController } from './invoices/invoices.controller.js';
import { InvoicesRepository } from './invoices/invoices.repository.js';
import { InvoicesService } from './invoices/invoices.service.js';

@Module({
  imports: [SalesModule, ProductModule, PlanningModule, PurchasingModule, AuditModule],
  controllers: [InvoicesController, FinanceController],
  providers: [InvoicesService, InvoicesRepository, FinanceService],
  exports: [InvoicesService],
})
export class BillingModule {}
