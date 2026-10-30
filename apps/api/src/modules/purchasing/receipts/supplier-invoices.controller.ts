import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { SupplierInvoicesQuery, SupplierPaymentDto } from '../orders/dto/purchasing.dto.js';
import { type SupplierInvoiceView, SupplierInvoicesService } from './supplier-invoices.service.js';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('v1/supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly invoices: SupplierInvoicesService) {}

  @Permission('purchasing:read')
  @Get()
  list(@Query() query: SupplierInvoicesQuery): Promise<SupplierInvoiceView[]> {
    return this.invoices.list({
      purchaseOrderId: query.purchaseOrderId,
      supplierId: query.supplierId,
      onlyOpen: query.open,
    });
  }

  @Permission('purchasing:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierInvoiceView> {
    return this.invoices.get(id);
  }

  /** The accountant pays a supplier invoice (all or part of it). */
  @Permission('payments:write')
  @Post(':id/payments')
  @HttpCode(200)
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupplierPaymentDto,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.pay(id, body);
  }
}
