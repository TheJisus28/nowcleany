import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/index.js';
import { SalesModule } from '../sales/index.js';
import { ShipmentsController } from './shipments/shipments.controller.js';
import { ShipmentsRepository } from './shipments/shipments.repository.js';
import { ShipmentsService } from './shipments/shipments.service.js';

@Module({
  imports: [SalesModule, AuditModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, ShipmentsRepository],
  exports: [ShipmentsService],
})
export class LogisticsModule {}
