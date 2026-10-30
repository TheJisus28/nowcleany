import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { Permission } from '../../../platform/security/decorators.js';
import type {
  Availability,
  MonthlyPurchase,
  OrderCoverageView,
  OversellReport,
  PlanningSummary,
  ProductionNeeds,
  PurchaseNeeds,
  StockAllocation,
} from './planning-views.js';
import { PlanningService } from './planning.service.js';

class MonthQuery {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

@ApiTags('planning')
@ApiBearerAuth()
@Controller('v1/planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Permission('planning:read')
  @Get('summary')
  summary(): Promise<PlanningSummary> {
    return this.planning.summary();
  }

  /** Sold per seller vs. capacity with available materials, and what to buy for the uncovered rest. */
  @Permission('planning:read')
  @Get('oversell')
  oversell(): Promise<OversellReport> {
    return this.planning.oversell();
  }

  @Permission('planning:read')
  @Get('order-coverage')
  orderCoverage(): Promise<OrderCoverageView[]> {
    return this.planning.orderCoverage();
  }

  @Permission('planning:read')
  @Get('production-needs')
  productionNeeds(): Promise<ProductionNeeds> {
    return this.planning.productionNeeds();
  }

  @Permission('planning:read')
  @Get('purchase-needs')
  purchaseNeeds(): Promise<PurchaseNeeds> {
    return this.planning.purchaseNeeds();
  }

  /** What can still be promised per finished good, so sales sees it before committing. */
  @Permission('planning:read')
  @Get('availability')
  availability(): Promise<Availability> {
    return this.planning.availability();
  }

  /** Idle stock vs. set aside for production vs. needed by orders vs. missing, per product. */
  @Permission('planning:read')
  @Get('stock-allocation')
  stockAllocation(): Promise<StockAllocation> {
    return this.planning.stockAllocation();
  }

  /** Purchasing's month: expected sales and what to buy for them (?month=2026-11). */
  @Permission('planning:read')
  @Get('monthly-purchase')
  monthlyPurchase(@Query() query: MonthQuery): Promise<MonthlyPurchase> {
    return this.planning.monthlyPurchase(query.month);
  }
}
