import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { Permission } from '../../../platform/security/decorators.js';
import { type FinanceSummary, FinanceService } from './finance.service.js';

class PeriodQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('v1/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  /** Receivables, payables and the collections and payments of the period (this month by default). */
  @Permission('finance:read')
  @Get('summary')
  summary(@Query() query: PeriodQuery): Promise<FinanceSummary> {
    return this.finance.summary({
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
  }
}
