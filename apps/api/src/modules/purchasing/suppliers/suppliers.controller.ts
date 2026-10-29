import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { SupplierDto, SupplierQuery, UpdateSupplierDto } from './dto/suppliers.dto.js';
import { type SupplierView, SuppliersService } from './suppliers.service.js';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('v1/suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Permission('suppliers:read')
  @Get()
  list(@Query() query: SupplierQuery): Promise<SupplierView[]> {
    return this.suppliers.list(query.q);
  }

  @Permission('suppliers:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierView> {
    return this.suppliers.get(id);
  }

  @Permission('suppliers:write')
  @Post()
  create(@Body() body: SupplierDto): Promise<SupplierView> {
    return this.suppliers.create(body);
  }

  @Permission('suppliers:write')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
  ): Promise<SupplierView> {
    return this.suppliers.update(id, body);
  }
}
