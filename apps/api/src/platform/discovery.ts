import { Injectable } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { ReflectableDecorator } from '@nestjs/core';

export interface DiscoveredMethod<T> {
  readonly options: T;
  readonly owner: string;
  readonly invoke: (...args: unknown[]) => Promise<unknown>;
}

/** Finds provider methods marked with a Reflector decorator (event consumers, scheduled jobs). */
@Injectable()
export class MethodDiscovery {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  find<T>(decorator: ReflectableDecorator<T>): DiscoveredMethod<T>[] {
    const found: DiscoveredMethod<T>[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance) as object | null;
      if (!prototype) continue;
      for (const method of this.scanner.getAllMethodNames(prototype)) {
        const handler = (instance as Record<string, unknown>)[method];
        if (typeof handler !== 'function') continue;
        const options = this.reflector.get(decorator, handler);
        if (options === undefined) continue;
        found.push({
          options,
          owner: `${instance.constructor.name}.${method}`,
          invoke: (...args) => Promise.resolve(handler.apply(instance, args)),
        });
      }
    }
    return found;
  }
}
