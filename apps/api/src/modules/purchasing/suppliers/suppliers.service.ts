import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotFoundError, ValidationError } from '../../../shared-kernel/index.js';
import { normalizeSupplier } from '../domain/purchase-order.js';
import { type SupplierRecord, SuppliersRepository } from './suppliers.repository.js';

export type SupplierView = SupplierRecord;

export interface SupplierCommand {
  readonly documentNumber?: string;
  readonly name: string;
  readonly contact?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly city?: string;
}

@Injectable()
export class SuppliersService {
  constructor(private readonly suppliers: SuppliersRepository) {}

  @Transactional()
  list(search?: string): Promise<SupplierView[]> {
    return this.suppliers.list(search);
  }

  @Transactional()
  get(id: string): Promise<SupplierView> {
    return this.require(id);
  }

  @Transactional()
  async create(command: SupplierCommand): Promise<SupplierView> {
    const id = await this.suppliers.insert(normalizeSupplier(command));
    return this.require(id);
  }

  @Transactional()
  async update(
    id: string,
    command: Partial<SupplierCommand> & { active?: boolean },
  ): Promise<SupplierView> {
    const current = await this.require(id);
    await this.suppliers.update(id, {
      ...normalizeSupplier({
        documentNumber: command.documentNumber ?? current.documentNumber,
        name: command.name ?? current.name,
        contact: command.contact ?? current.contact,
        phone: command.phone ?? current.phone,
        email: command.email ?? current.email,
        city: command.city ?? current.city,
      }),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    return this.require(id);
  }

  /** The supplier of a new purchase order: it must exist and be active. */
  @Transactional()
  async requireActive(id: string): Promise<{ id: string; name: string }> {
    const supplier = await this.require(id);
    if (!supplier.active) {
      throw new ValidationError(
        'purchasing.inactive_supplier',
        `El proveedor ${supplier.name} está desactivado.`,
      );
    }
    return { id: supplier.id, name: supplier.name };
  }

  private async require(id: string): Promise<SupplierRecord> {
    const supplier = await this.suppliers.findById(id);
    if (!supplier)
      throw new NotFoundError('purchasing.supplier_not_found', 'El proveedor no existe.');
    return supplier;
  }
}
