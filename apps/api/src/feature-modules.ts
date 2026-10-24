import { IdentityModule } from './modules/identity/index.js';

/** Business modules loaded by the API, the worker and the seed script. */
export const FEATURE_MODULES = [IdentityModule];
