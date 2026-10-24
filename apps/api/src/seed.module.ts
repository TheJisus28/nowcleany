import { Module } from '@nestjs/common';
import { FEATURE_MODULES } from './feature-modules.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [PlatformModule.forScript(), ...FEATURE_MODULES],
})
export class SeedModule {}
