import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQuery,
  SupplierInvoiceDto,
} from './dto/purchasing.dto.js';
import type { PurchaseOrderView } from './purchase-order-view.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import {
  type SupplierInvoiceView,
  SupplierInvoicesService,
} from '../receipts/supplier-invoices.service.js';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('v1/purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly orders: PurchaseOrdersService,
    private readonly invoices: SupplierInvoicesService,
  ) {}

  @Permission('purchasing:read')
  @Get()
  list(@Query() query: ListPurchaseOrdersQuery): Promise<PurchaseOrderView[]> {
    return this.orders.list({
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Permission('purchasing:write')
  @Post()
  create(@Body() body: CreatePurchaseOrderDto): Promise<PurchaseOrderView> {
    return this.orders.create(body);
  }

  @Permission('purchasing:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderView> {
    return this.orders.get(id);
  }

  /** Receiving enters a supplier invoice: the goods that came with it go into stock. */
  @Permission('purchasing:receive')
  @Post(':id/supplier-invoices')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupplierInvoiceDto,
  ): Promise<SupplierInvoiceView> {
    return this.invoices.register(id, body);
  }

  @Permission('purchasing:write')
  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderView> {
    return this.orders.close(id);
  }

  @Permission('purchasing:write')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderView> {
    return this.orders.cancel(id);
  }
}
