import { Injectable } from '@nestjs/common';
import { CLS_ID, ClsService } from 'nestjs-cls';
import { ForbiddenError, UnauthorizedError } from '../../shared-kernel/index.js';
import type { Actor } from './actor.js';

const ACTOR_KEY = 'platform.actor';

/** Access to the actor of the current request or job, stored in the CLS context. */
@Injectable()
export class CurrentActor {
  constructor(private readonly cls: ClsService) {}

  get(): Actor | undefined {
    return this.cls.isActive() ? this.cls.get<Actor | undefined>(ACTOR_KEY) : undefined;
  }

  set(actor: Actor): void {
    this.cls.set(ACTOR_KEY, actor);
  }

  require(): Actor {
    const actor = this.get();
    if (!actor) {
      throw new UnauthorizedError(
        'auth.required',
        'Debes iniciar sesión para realizar esta acción.',
      );
    }
    return actor;
  }

  /**
   * Re-checks a permission inside a service. Required when the service is reached from another module
   * or a job, where no route guard ran.
   */
  requirePermission(permission: string): Actor {
    const actor = this.require();
    if (!actor.permissions.has(permission)) {
      throw new ForbiddenError('auth.forbidden', 'No tienes permiso para realizar esta acción.', {
        permission,
      });
    }
    return actor;
  }

  /** Runs `fn` in a fresh CLS context acting as `actor` (jobs and event consumers). */
  runAs<T>(actor: Actor, fn: () => Promise<T>, requestId?: string): Promise<T> {
    return this.cls.run(() => {
      if (requestId) this.cls.set(CLS_ID, requestId);
      this.set(actor);
      return fn();
    });
  }
}
