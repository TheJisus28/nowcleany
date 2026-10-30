import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { TrailQuery } from './dto/trail.dto.js';
import { Trail, type TrailView } from './trail.service.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/trail')
export class TrailController {
  constructor(private readonly trail: Trail) {}

  @Permission('trail:read')
  @Get()
  list(@Query() query: TrailQuery): Promise<TrailView[]> {
    return this.trail.list({
      entityType: query.entityType,
      search: query.q,
      from: query.from,
      limit: query.limit,
    });
  }
}
