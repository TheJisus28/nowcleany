import type { CustomerData } from '../domain/customer.js';

export interface CustomerRecord extends CustomerData {
  readonly id: string;
  readonly active: boolean;
}

export abstract class CustomersRepository {
  abstract list(search?: string): Promise<CustomerRecord[]>;
  abstract findById(id: string): Promise<CustomerRecord | undefined>;
  abstract findByIds(ids: readonly string[]): Promise<CustomerRecord[]>;
  abstract insert(customer: CustomerData): Promise<string>;
  abstract update(id: string, customer: CustomerData & { active?: boolean }): Promise<void>;
}
