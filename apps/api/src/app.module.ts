import { Module } from '@nestjs/common';
import { FEATURE_MODULES } from './feature-modules.js';
import { IdentityModule, JwtTokenVerifier } from './modules/identity/index.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [
    PlatformModule.forApi({
      authentication: { imports: [IdentityModule], verifier: JwtTokenVerifier },
    }),
    ...FEATURE_MODULES,
  ],
})
export class AppModule {}
