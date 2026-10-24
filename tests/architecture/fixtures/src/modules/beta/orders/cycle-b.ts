// Closes the no-circular cycle reported from cycle-a.ts.
import { a } from './cycle-a.js';

export const b = (): number => a() - 1;
