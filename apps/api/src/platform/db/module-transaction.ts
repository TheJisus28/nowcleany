import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';

/**
 * Injected in repositories with `@InjectTransactionHost()`; `host.tx` is the Kysely instance, bound to
 * the active `@Transactional()` transaction when there is one. `DB` lists the tables the class uses.
 */
export type ModuleTransactionHost<DB> = TransactionHost<TransactionalAdapterKysely<DB>>;
