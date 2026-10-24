import { Injectable, type OnApplicationBootstrap, type Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';

/** Maps each controller class to the name of the Nest module that declares it (for the `module` log field). */
@Injectable()
export class RouteModules implements OnApplicationBootstrap {
  private readonly byController = new Map<Type, string>();

  constructor(private readonly modules: ModulesContainer) {}

  onApplicationBootstrap(): void {
    for (const module of this.modules.values()) {
      const name = module.metatype.name.replace(/Module$/, '').toLowerCase();
      for (const controller of module.controllers.keys()) {
        if (typeof controller === 'function') this.byController.set(controller as Type, name);
      }
    }
  }

  of(controller: Type): string | undefined {
    return this.byController.get(controller);
  }
}
