import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotFoundError } from '../../../shared-kernel/index.js';
import { normalizeCustomer } from '../domain/customer.js';
import { type CustomerRecord, CustomersRepository } from './customers.repository.js';

export type CustomerView = CustomerRecord;

export interface CustomerCommand {
  readonly name: string;
  readonly taxId?: string;
  readonly phone?: string;
  readonly city?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomersRepository) {}

  @Transactional('sales')
  list(search?: string): Promise<CustomerView[]> {
    return this.customers.list(search);
  }

  @Transactional('sales')
  async create(command: CustomerCommand): Promise<CustomerView> {
    const id = await this.customers.insert(normalizeCustomer(command));
    return this.require(id);
  }

  @Transactional('sales')
  async update(id: string, command: CustomerCommand & { active?: boolean }): Promise<CustomerView> {
    await this.require(id);
    await this.customers.update(id, {
      ...normalizeCustomer(command),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    return this.require(id);
  }

  private async require(id: string): Promise<CustomerRecord> {
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundError('sales.customer_not_found', 'El cliente no existe.');
    return customer;
  }
}
