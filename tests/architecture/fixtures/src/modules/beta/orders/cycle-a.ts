// BAD: no-circular (cycle with cycle-b.ts)
import { b } from './cycle-b.js';

export const a = (): number => b() + 1;
