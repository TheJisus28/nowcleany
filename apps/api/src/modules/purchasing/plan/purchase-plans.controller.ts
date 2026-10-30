import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { PurchasePlanDto } from '../orders/dto/purchasing.dto.js';
import { PurchasePlansService } from './purchase-plans.service.js';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller('v1/purchase-plans')
export class PurchasePlansController {
  constructor(private readonly plans: PurchasePlansService) {}

  @Permission('purchasing:read')
  @Get(':month')
  async get(@Param('month') month: string) {
    return (await this.plans.forMonth(month)).map((line) => ({
      productId: line.productId,
      quantity: line.quantity.toString(),
      setBy: line.setByName,
      updatedAt: line.updatedAt.toISOString(),
    }));
  }

  /** Purchasing's expected needs for the month ("2026-11"); planning turns them into purchases. */
  @Permission('purchasing:write')
  @Put(':month')
  async save(@Param('month') month: string, @Body() body: PurchasePlanDto) {
    return (await this.plans.save(month, body.lines)).map((line) => ({
      productId: line.productId,
      quantity: line.quantity.toString(),
      setBy: line.setByName,
      updatedAt: line.updatedAt.toISOString(),
    }));
  }
}
