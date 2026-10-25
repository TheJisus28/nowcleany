import type { FormulaStatus } from '../domain/formula.js';

export interface FormulaLineRecord {
  readonly lineNo: number;
  readonly componentId: string;
  /** Per batch, base units of the component. */
  readonly quantity: bigint;
  readonly wasteBps: number;
}

export interface FormulaRecord {
  readonly id: string;
  readonly productId: string;
  readonly version: number;
  readonly status: FormulaStatus;
  /** Base units of the product. */
  readonly batchYield: bigint;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdByName: string;
  readonly createdAt: Date;
  readonly publishedBy: string | null;
  readonly publishedByName: string | null;
  readonly publishedAt: Date | null;
  readonly retiredAt: Date | null;
  readonly lines: readonly FormulaLineRecord[];
}

export interface DraftContent {
  readonly batchYield: bigint;
  readonly notes: string | null;
  readonly author: { id: string; name: string };
  readonly lines: readonly { componentId: string; quantity: bigint; wasteBps: number }[];
}

export abstract class FormulasRepository {
  abstract findById(id: string): Promise<FormulaRecord | undefined>;
  abstract findByStatus(
    productId: string,
    status: 'DRAFT' | 'ACTIVE',
  ): Promise<FormulaRecord | undefined>;
  abstract history(productId: string): Promise<FormulaRecord[]>;
  abstract activeFor(productIds: readonly string[]): Promise<FormulaRecord[]>;
  /** Products whose active formula consumes this component. */
  abstract productsUsing(componentId: string): Promise<string[]>;
  abstract nextVersion(productId: string): Promise<number>;
  abstract insertDraft(productId: string, version: number, content: DraftContent): Promise<string>;
  abstract replaceDraft(formulaId: string, content: DraftContent): Promise<void>;
  abstract deleteDraft(formulaId: string): Promise<void>;
  abstract retire(formulaId: string): Promise<void>;
  abstract publish(formulaId: string, publisher: { id: string; name: string }): Promise<void>;
}
