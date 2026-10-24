import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';

/**
 * Injected in Kysely repositories with `@InjectTransactionHost('<module>')`; `host.tx` is the module's
 * Kysely instance, bound to the active `@Transactional('<module>')` transaction when there is one.
 */
export type ModuleTransactionHost<DB> = TransactionHost<TransactionalAdapterKysely<DB>>;
