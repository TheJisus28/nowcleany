import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { type CustomerView, CustomersService } from './customers.service.js';
import { CustomerDto, CustomerQuery, UpdateCustomerDto } from './dto/customers.dto.js';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Permission('customers:read')
  @Get()
  list(@Query() query: CustomerQuery): Promise<CustomerView[]> {
    return this.customers.list(query.q);
  }

  @Permission('customers:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerView> {
    return this.customers.get(id);
  }

  @Permission('customers:write')
  @Post()
  create(@Body() body: CustomerDto): Promise<CustomerView> {
    return this.customers.create(body);
  }

  @Permission('customers:write')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerView> {
    return this.customers.update(id, body);
  }
}
