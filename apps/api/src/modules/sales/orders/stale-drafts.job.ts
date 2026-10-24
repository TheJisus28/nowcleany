import { Injectable } from '@nestjs/common';
import { ScheduledJob } from '../../../platform/jobs/scheduled-job.js';
import { SalesOrdersService } from './sales-orders.service.js';

/** Runs in the worker: frees stock committed by confirmations that never finished. */
@Injectable()
export class StaleDraftsJob {
  constructor(private readonly orders: SalesOrdersService) {}

  @ScheduledJob({
    name: 'sales.release-stale-drafts',
    intervalMs: 60_000,
    permissions: ['inventory:reserve'],
  })
  async run(): Promise<void> {
    await this.orders.releaseStaleDrafts();
  }
}
