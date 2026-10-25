import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MethodDiscovery } from '../discovery.js';
import { systemActor } from '../security/actor.js';
import { CurrentActor } from '../security/current-actor.js';
import { PermissionRegistry } from '../security/permission-registry.js';

export interface SeederOptions {
  readonly name: string;
  /** Lower runs first. */
  readonly order: number;
  /** Illustrative demo data, only loaded with `migrate --demo`. */
  readonly demo?: boolean;
  /** Extra volume on top of the demo (a plant in full swing), only with `migrate --showcase`. */
  readonly showcase?: boolean;
}

/** Marks an idempotent provider method that loads reference or demo data. Run by migrate.ts. */
export const Seeder = Reflector.createDecorator<SeederOptions>();

@Injectable()
export class SeedRunner {
  private readonly logger = new Logger('platform');

  constructor(
    private readonly methods: MethodDiscovery,
    private readonly currentActor: CurrentActor,
    private readonly permissions: PermissionRegistry,
  ) {}

  async run(options: { demo: boolean; showcase?: boolean }): Promise<void> {
    const seeders = this.methods
      .find(Seeder)
      .filter(({ options: seeder }) =>
        seeder.showcase === true ? options.showcase === true : seeder.demo !== true || options.demo,
      )
      .sort((a, b) => a.options.order - b.options.order);
    const actor = systemActor(
      'seed',
      this.permissions.all().map((permission) => permission.code),
      'Carga inicial',
    );
    for (const seeder of seeders) {
      await this.currentActor.runAs(actor, () => seeder.invoke());
      this.logger.log(`Semilla aplicada: ${seeder.options.name}`);
    }
  }
}
