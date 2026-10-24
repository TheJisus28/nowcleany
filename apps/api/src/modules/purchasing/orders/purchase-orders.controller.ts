import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQuery,
  ReceivePurchaseOrderDto,
} from './dto/purchasing.dto.js';
import { type PurchaseOrderView, PurchaseOrdersService } from './purchase-orders.service.js';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('v1/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Permission('purchasing:read')
  @Get()
  list(@Query() query: ListPurchaseOrdersQuery): Promise<PurchaseOrderView[]> {
    return this.orders.list({
      ...(query.status ? { statuses: query.status } : {}),
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

  @Permission('purchasing:receive')
  @Post(':id/receive')
  @HttpCode(200)
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReceivePurchaseOrderDto,
  ): Promise<PurchaseOrderView> {
    return this.orders.receive(id, body);
  }

  @Permission('purchasing:write')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseOrderView> {
    return this.orders.cancel(id);
  }
}
