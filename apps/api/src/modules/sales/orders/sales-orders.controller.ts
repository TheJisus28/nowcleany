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
import { CancelOrderDto, ListOrdersQuery, OrderDto } from './dto/orders.dto.js';
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

  @Permission('sales-orders:dispatch')
  @Post(':id/dispatch')
  @HttpCode(200)
  dispatch(@Param('id', ParseUUIDPipe) id: string): Promise<SalesOrderView> {
    return this.orders.dispatch(id);
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
