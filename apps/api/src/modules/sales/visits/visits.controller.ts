import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { VisitDto, VisitQuery } from './dto/visits.dto.js';
import { type VisitView, VisitsService } from './visits.service.js';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('v1/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Permission('visits:read')
  @Get()
  list(@Query() query: VisitQuery): Promise<VisitView[]> {
    return this.visits.list({
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
  }

  @Permission('visits:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<VisitView> {
    return this.visits.get(id);
  }

  /** Check-in from the seller app with the phone's position. */
  @Permission('visits:write')
  @Post()
  record(@Body() body: VisitDto): Promise<VisitView> {
    return this.visits.record(body);
  }
}
