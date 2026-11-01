import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import {
  CancelOrderDto,
  ListOrdersQuery,
  OrderDto,
  PrepareOrderDto,
  PriorityDto,
} from './dto/orders.dto.js';
import type { SalesOrderView } from './order-view.js';
import { SalesOrdersService } from './sales-orders.service.js';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('v1/sales-orders')
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Permission('sales-orders:read')
  @Get()
  list(@Query() query: ListOrdersQuery): Promise<SalesOrderView[]> {
    return this.orders.list({
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.mine === undefined ? {} : { mine: query.mine }),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.q ? { search: query.q } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Permission('sales-orders:write')
  @Post()
  create(@Body() body: OrderDto): Promise<SalesOrderView> {
    return this.orders.create(body);
  }

  @Permission('sales-orders:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderView> {
    return this.orders.get(id);
  }

  @Permission('sales-orders:write')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: OrderDto): Promise<SalesOrderView> {
    return this.orders.update(id, body);
  }

  @Permission('sales-orders:write')
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderView> {
    return this.orders.confirm(id);
  }

  /** Plant separated the invoiced order in a warehouse, ready for dispatch. */
  @Permission('sales-orders:prepare')
  @Post(':id/prepare')
  @HttpCode(200)
  prepare(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PrepareOrderDto,
  ): Promise<SalesOrderView> {
    return this.orders.prepare(id, body.lines, undefined, {
      ...(body.warehouse ? { warehouse: body.warehouse } : {}),
    });
  }

  /** The consolidator's order to share the available stock among invoices. */
  @Permission('invoices:issue')
  @Patch(':id/priority')
  setPriority(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PriorityDto,
  ): Promise<SalesOrderView> {
    return this.orders.setPriority(id, body.priority ?? null);
  }

  /** Who did and authorized each step. */
  @Permission('sales-orders:read')
  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.history(id);
  }

  @Permission('sales-orders:write')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelOrderDto,
  ): Promise<SalesOrderView> {
    return this.orders.cancel(id, body.reason);
  }
}
