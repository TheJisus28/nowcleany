import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import type { BranchView, CustomerView } from './customer-view.js';
import { CustomersService } from './customers.service.js';
import {
  BranchDto,
  CustomerDto,
  CustomerQuery,
  UpdateBranchDto,
  UpdateCustomerDto,
} from './dto/customers.dto.js';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('v1/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** A seller gets their portfolio; customers:read-all gets everyone (optionally by seller). */
  @Permission('customers:read')
  @Get()
  list(@Query() query: CustomerQuery): Promise<CustomerView[]> {
    return this.customers.list({
      ...(query.q ? { search: query.q } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
    });
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

  @Permission('customers:write')
  @Post(':id/branches')
  addBranch(@Param('id', ParseUUIDPipe) id: string, @Body() body: BranchDto): Promise<BranchView> {
    return this.customers.addBranch(id, body);
  }

  @Permission('customers:write')
  @Patch(':id/branches/:branchId')
  updateBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() body: UpdateBranchDto,
  ): Promise<BranchView> {
    return this.customers.updateBranch(id, branchId, body);
  }
}
