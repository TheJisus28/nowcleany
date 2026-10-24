import { type DynamicModule, Module, type Type } from '@nestjs/common';
import {
  ClsPluginTransactional,
  getTransactionHostToken,
  type TransactionHost,
} from '@nestjs-cls/transactional';
import { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import { ClsModule, ClsService } from 'nestjs-cls';
import { EventPublisher } from '../outbox/event-publisher.js';
import { Inbox } from '../outbox/inbox.js';
import { CurrentActor } from '../security/current-actor.js';
import { DatabasePools } from './database-pools.js';

export const kyselyToken = (module: string): string => `platform.kysely.${module}`;

// Nest de-duplicates dynamic modules by class, so every database module gets its own named class.
const moduleClasses = new Map<string, { database: Type; connection: Type }>();

function classesFor(module: string): { database: Type; connection: Type } {
  let classes = moduleClasses.get(module);
  if (!classes) {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- configured by Module() below
    const database = class {};
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- configured by Module() below
    const connection = class {};
    Object.defineProperty(database, 'name', { value: `${module}DatabaseModule` });
    Object.defineProperty(connection, 'name', { value: `${module}ConnectionModule` });
    Module({})(database);
    Module({})(connection);
    classes = { database, connection };
    moduleClasses.set(module, classes);
  }
  return classes;
}

/**
 * Wires a feature module to its own schema: the module's pool/role, a named transactional connection
 * (`@Transactional('<module>')`, `@InjectTransactionHost('<module>')`), its EventPublisher and Inbox.
 */
@Module({})
export class DatabaseModule {
  static forModule(module: string): DynamicModule {
    const { database, connection } = classesFor(module);
    const token = kyselyToken(module);
    const hostToken = getTransactionHostToken(module);
    return {
      module: database,
      imports: [
        ClsModule.registerPlugins([
          new ClsPluginTransactional({
            connectionName: module,
            imports: [
              {
                module: connection,
                providers: [
                  {
                    provide: token,
                    inject: [DatabasePools],
                    useFactory: (pools: DatabasePools) => pools.kysely(module),
                  },
                ],
                exports: [token],
              },
            ],
            adapter: new TransactionalAdapterKysely({ kyselyInstanceToken: token }),
          }),
        ]),
      ],
      providers: [
        {
          provide: EventPublisher,
          inject: [hostToken, CurrentActor, ClsService],
          useFactory: (
            host: TransactionHost<TransactionalAdapterKysely>,
            actor: CurrentActor,
            cls: ClsService,
          ) =>
            new EventPublisher(module, host, actor, () =>
              cls.isActive() ? cls.getId() : undefined,
            ),
        },
        {
          provide: Inbox,
          inject: [hostToken],
          useFactory: (host: TransactionHost<TransactionalAdapterKysely>) => new Inbox(host),
        },
      ],
      exports: [EventPublisher, Inbox],
    };
  }
}
