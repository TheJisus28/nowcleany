import { Module } from '@nestjs/common';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [PlatformModule.forApi()],
})
export class AppModule {}
