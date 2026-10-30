import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/index.js';
import { IdentityModule } from '../identity/index.js';
import { LogisticsModule } from '../logistics/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingModule } from '../purchasing/index.js';
import { SalesModule } from '../sales/index.js';
import { DemoActors } from './demo-actors.js';
import { HistorySeeder } from './history.seeder.js';
import { PipelineSeeder } from './pipeline.seeder.js';

/**
 * Example data from end to end: six months of history and today's operation, each step done by the
 * person whose job it is (through the public services of the other modules). Used only by seed.ts.
 */
@Module({
  imports: [
    IdentityModule,
    SalesModule,
    BillingModule,
    LogisticsModule,
    PurchasingModule,
    ProductModule,
  ],
  providers: [DemoActors, HistorySeeder, PipelineSeeder],
})
export class DemoModule {}
