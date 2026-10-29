import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { PinoLogger } from 'nestjs-pino';
import { ForbiddenError, UnauthorizedError } from '../../shared-kernel/index.js';
import { CurrentActor } from './current-actor.js';
import { Permission, Public } from './decorators.js';
import { TokenVerifier } from './token-verifier.js';

const BEARER = /^Bearer\s+(\S+)$/i;

/** Global guard: authenticates every route that is not marked @Public(). Never a middleware. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly currentActor: CurrentActor,
    private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedError(
        'auth.missing_token',
        'Debes iniciar sesión para usar esta ruta.',
      );
    }
    const actor = await this.verifier.verify(token);
    this.currentActor.set(actor);
    this.assignLogFields({ actorId: actor.id });
    return true;
  }

  private assignLogFields(fields: Record<string, string | undefined>): void {
    try {
      this.logger.assign(fields);
    } catch {
      // Outside an HTTP request log context (e.g. some tests): nothing to enrich.
    }
  }
}

/** Global guard: deny by default. A route needs @Permission('x:y') (held by the actor) or @Public(). */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger('platform');

  constructor(
    private readonly reflector: Reflector,
    private readonly currentActor: CurrentActor,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublic(this.reflector, context)) return true;

    const required = this.reflector.getAllAndOverride(Permission, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      this.logger.error(
        `Ruta sin @Permission ni @Public: ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenError('auth.route_not_configured', 'No tienes permiso para esta acción.');
    }
    this.currentActor.requirePermission(required);
    return true;
  }
}

function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
  // Read by key: the decorator typing says `true`, but undecorated routes yield undefined.
  const value = reflector.getAllAndOverride<boolean | undefined>(Public.KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  return value === true;
}
