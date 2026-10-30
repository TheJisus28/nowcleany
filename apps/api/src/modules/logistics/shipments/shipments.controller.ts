import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { CreateShipmentDto, DeliverDto, ShipmentsQuery } from './dto/shipments.dto.js';
import { type ShipmentView, ShipmentsService } from './shipments.service.js';

@ApiTags('logistics')
@ApiBearerAuth()
@Controller('v1/shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Permission('shipments:read')
  @Get()
  list(@Query() query: ShipmentsQuery): Promise<ShipmentView[]> {
    return this.shipments.list({
      ...(query.status ? { statuses: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    });
  }

  @Permission('shipments:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentView> {
    return this.shipments.get(id);
  }

  @Permission('shipments:write')
  @Post()
  create(@Body() body: CreateShipmentDto): Promise<ShipmentView> {
    return this.shipments.create(body);
  }

  @Permission('shipments:write')
  @Post(':id/dispatch')
  @HttpCode(200)
  dispatch(@Param('id', ParseUUIDPipe) id: string): Promise<ShipmentView> {
    return this.shipments.dispatch(id);
  }

  @Permission('shipments:write')
  @Post(':id/orders/:orderId/deliver')
  @HttpCode(200)
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: DeliverDto,
  ): Promise<ShipmentView> {
    return this.shipments.deliver(id, orderId, body.receivedBy);
  }
}
