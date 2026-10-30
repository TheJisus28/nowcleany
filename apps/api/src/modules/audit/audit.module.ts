import { Module } from '@nestjs/common';
import { TrailController } from './trail/trail.controller.js';
import { TrailRepository } from './trail/trail.repository.js';
import { Trail } from './trail/trail.service.js';

@Module({
  controllers: [TrailController],
  providers: [Trail, TrailRepository],
  exports: [Trail],
})
export class AuditModule {}
