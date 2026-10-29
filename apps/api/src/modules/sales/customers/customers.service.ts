import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { ForbiddenError, NotFoundError } from '../../../shared-kernel/index.js';
import { UserDirectory } from '../../identity/index.js';
import {
  type BranchData,
  type DocumentType,
  normalizeBranch,
  normalizeCustomer,
} from '../domain/customer.js';
import {
  type BranchView,
  type CustomerView,
  toBranchView,
  toCustomerView,
} from './customer-view.js';
import {
  type BranchRecord,
  type CustomerRecord,
  CustomersRepository,
} from './customers.repository.js';

export interface CustomerCommand {
  readonly documentType: DocumentType;
  readonly documentNumber: string;
  readonly name: string;
  readonly address?: string;
  readonly phone?: string;
  readonly city?: string;
  readonly sellerId?: string;
  readonly location?: { latitude: number; longitude: number };
}

export interface BranchCommand {
  readonly name: string;
  readonly address?: string;
  readonly city?: string;
  readonly phone?: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly active?: boolean;
}

/**
 * Customers belong to a seller (their portfolio). A seller sees and sells only to their own; whoever
 * holds customers:read-all sees every customer, and customers:assign moves them between sellers.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomersRepository,
    private readonly users: UserDirectory,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async list(filter: { search?: string; sellerId?: string }): Promise<CustomerView[]> {
    const own = this.ownPortfolio();
    const rows = await this.customers.list({
      ...(filter.search ? { search: filter.search } : {}),
      ...(own ? { sellerId: own } : filter.sellerId ? { sellerId: filter.sellerId } : {}),
    });
    return rows.map(toCustomerView);
  }

  @Transactional()
  async get(id: string): Promise<CustomerView> {
    return toCustomerView(await this.require(id));
  }

  /** The customer, if the current user may sell to it (used by orders and visits). */
  @Transactional()
  async requireVisible(id: string): Promise<CustomerRecord> {
    return this.require(id);
  }

  @Transactional()
  async create(command: CustomerCommand): Promise<CustomerView> {
    const data = normalizeCustomer(command);
    const id = await this.customers.insert(data, await this.sellerFor(command.sellerId));
    await this.customers.insertBranch(
      id,
      normalizeBranch({
        name: 'Principal',
        address: data.address,
        city: data.city,
        phone: data.phone,
        latitude: command.location?.latitude ?? null,
        longitude: command.location?.longitude ?? null,
      }),
      true,
    );
    return this.get(id);
  }

  @Transactional()
  async update(
    id: string,
    command: Partial<Omit<CustomerCommand, 'sellerId'>> & {
      sellerId?: string | null | undefined;
      active?: boolean | undefined;
    },
  ): Promise<CustomerView> {
    const current = await this.require(id);
    const data = normalizeCustomer({
      documentType: command.documentType ?? current.documentType,
      documentNumber: command.documentNumber ?? current.documentNumber,
      name: command.name ?? current.name,
      address: command.address ?? current.address,
      phone: command.phone ?? current.phone,
      city: command.city ?? current.city,
    });
    let sellerId: string | null | undefined;
    if (command.sellerId !== undefined) {
      this.currentActor.requirePermission('customers:assign');
      sellerId = command.sellerId === null ? null : await this.sellerFor(command.sellerId);
    }
    await this.customers.update(id, {
      ...data,
      ...(sellerId === undefined ? {} : { sellerId }),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    return this.get(id);
  }

  @Transactional()
  async addBranch(customerId: string, command: BranchCommand): Promise<BranchView> {
    await this.require(customerId);
    const id = await this.customers.insertBranch(customerId, branchData(command), false);
    return toBranchView(await this.requireBranch(customerId, id));
  }

  @Transactional()
  async updateBranch(
    customerId: string,
    branchId: string,
    command: BranchCommand,
  ): Promise<BranchView> {
    await this.require(customerId);
    await this.requireBranch(customerId, branchId);
    await this.customers.updateBranch(branchId, {
      ...branchData(command),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    return toBranchView(await this.requireBranch(customerId, branchId));
  }

  /** The branch of a customer the current user may sell to. */
  @Transactional()
  async requireBranch(customerId: string, branchId: string): Promise<BranchRecord> {
    const branch = await this.customers.findBranch(branchId);
    if (branch?.customerId !== customerId) {
      throw new NotFoundError('sales.branch_not_found', 'La sucursal no existe para este cliente.');
    }
    return branch;
  }

  /** The seller id to filter by, or undefined when the user sees every customer. */
  private ownPortfolio(): string | undefined {
    const actor = this.currentActor.require();
    return actor.system || actor.permissions.has('customers:read-all') ? undefined : actor.id;
  }

  private async require(id: string): Promise<CustomerRecord> {
    const customer = await this.customers.findById(id);
    const own = this.ownPortfolio();
    if (!customer || (own && customer.seller?.id !== own)) {
      throw new NotFoundError(
        'sales.customer_not_found',
        'El cliente no existe o no es de tu cartera.',
      );
    }
    return customer;
  }

  /** Assigning another seller needs customers:assign; a seller creating a customer keeps it. */
  private async sellerFor(requested: string | undefined): Promise<string | null> {
    const actor = this.currentActor.require();
    if (requested && requested !== actor.id) {
      if (!actor.system && !actor.permissions.has('customers:assign')) {
        throw new ForbiddenError(
          'sales.cannot_assign',
          'Solo gerencia puede asignar clientes a otro vendedor.',
        );
      }
      const [seller] = await this.users.findByIds([requested]);
      if (!seller?.roles.includes('sales')) {
        throw new NotFoundError('sales.seller_not_found', 'El vendedor no existe.');
      }
      return seller.id;
    }
    if (requested) return requested;
    return actor.permissions.has('sales-orders:write') && !actor.system ? actor.id : null;
  }
}

function branchData(command: BranchCommand): BranchData {
  return normalizeBranch({
    name: command.name,
    address: command.address,
    city: command.city,
    phone: command.phone,
    latitude: command.latitude ?? null,
    longitude: command.longitude ?? null,
  });
}
