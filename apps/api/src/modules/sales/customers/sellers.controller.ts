import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { UserDirectory } from '../../identity/index.js';

/** Sellers, for filters and to assign customers to a portfolio. */
@ApiTags('sales')
@ApiBearerAuth()
@Controller('v1/sellers')
export class SellersController {
  constructor(private readonly users: UserDirectory) {}

  @Permission('customers:read')
  @Get()
  async list(): Promise<{ id: string; name: string }[]> {
    return (await this.users.sellers())
      .map((seller) => ({ id: seller.id, name: seller.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
