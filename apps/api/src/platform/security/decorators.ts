import { Reflector } from '@nestjs/core';

/** Permission required by a route, e.g. `@Permission('product:create')`. */
export const Permission = Reflector.createDecorator<string>();

/** Marks a route (or controller) as reachable without authentication. */
export const Public = Reflector.createDecorator<undefined, true>({ transform: () => true });
