import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../../platform/security/decorators.js';
import { IssueInvoicesDto, ListInvoicesQuery, PaymentDto } from './dto/invoices.dto.js';
import type { InvoiceView } from './invoice-view.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('v1/invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Permission('invoices:read')
  @Get()
  async list(@Query() query: ListInvoicesQuery): Promise<InvoiceView[]> {
    if (query.orderId) {
      const invoice = await this.invoices.ofOrder(query.orderId);
      return invoice ? [invoice] : [];
    }
    return this.invoices.list({
      customerId: query.customerId,
      search: query.q,
      onlyOpen: query.open,
      limit: query.limit,
    });
  }

  @Permission('invoices:read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<InvoiceView> {
    return this.invoices.get(id);
  }

  /** The consolidation: invoices the chosen pre-sales, even when stock does not cover them. */
  @Permission('invoices:issue')
  @Post()
  issue(@Body() body: IssueInvoicesDto): Promise<InvoiceView[]> {
    return this.invoices.issue(body.orders);
  }

  @Permission('payments:write')
  @Post(':id/payments')
  @HttpCode(200)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() body: PaymentDto): Promise<InvoiceView> {
    return this.invoices.recordPayment(id, body);
  }
}
