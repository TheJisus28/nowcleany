import { Module } from '@nestjs/common';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [PlatformModule.forWorker()],
})
export class WorkerModule {}
