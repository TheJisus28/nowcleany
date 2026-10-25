import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import {
  CompleteProductionOrderDto,
  CreateProductionOrderDto,
  ListProductionOrdersQuery,
} from './dto/production.dto.js';
import { type ProductionOrderView, ProductionOrdersService } from './production-orders.service.js';

@ApiTags('production')
@ApiBearerAuth()
@Controller('v1/production-orders')
export class ProductionOrdersController {
  constructor(private readonly orders: ProductionOrdersService) {}

  @Permission('production:read')
  @Get()
  list(@Query() query: ListProductionOrdersQuery): Promise<ProductionOrderView[]> {
    return this.orders.list({
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
    });
  }

  @Permission('production:write')
  @Post()
  create(@Body() body: CreateProductionOrderDto): Promise<ProductionOrderView> {
    return this.orders.create(body);
  }

  @Permission('production:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderView> {
    return this.orders.get(id);
  }

  /** Records the real output and consumes the formula in inventory. */
  @Permission('production:write')
  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteProductionOrderDto,
  ): Promise<ProductionOrderView> {
    return this.orders.complete(id, body);
  }

  @Permission('production:write')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<ProductionOrderView> {
    return this.orders.cancel(id);
  }
}
