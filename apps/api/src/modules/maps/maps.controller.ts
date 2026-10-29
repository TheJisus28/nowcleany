import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Permission } from '../../platform/security/decorators.js';
import { type MapConfig, MapsService, type Place } from './maps.service.js';

class GeocodeQuery {
  @IsString()
  @MaxLength(200)
  q!: string;
}

@ApiTags('maps')
@ApiBearerAuth()
@Controller('v1/maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Permission('profile:read')
  @Get('config')
  config(): MapConfig {
    return this.maps.mapConfig();
  }

  /** Address search for placing a branch on the map. */
  @Permission('customers:write')
  @Get('geocode')
  geocode(@Query() query: GeocodeQuery): Promise<Place[]> {
    return this.maps.geocode(query.q);
  }
}
