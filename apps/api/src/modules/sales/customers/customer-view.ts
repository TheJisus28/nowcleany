import { DOCUMENT_TYPE_LABELS, type DocumentType } from '../domain/customer.js';
import type { BranchRecord, CustomerRecord } from './customers.repository.js';

export interface BranchView {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly city: string | null;
  readonly phone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly isMain: boolean;
  readonly active: boolean;
}

export interface CustomerView {
  readonly id: string;
  readonly documentType: DocumentType;
  readonly documentTypeLabel: string;
  readonly documentNumber: string;
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly active: boolean;
  readonly seller: { id: string; name: string } | null;
  readonly branches: readonly BranchView[];
}

export function toBranchView(branch: BranchRecord): BranchView {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    latitude: branch.latitude,
    longitude: branch.longitude,
    isMain: branch.isMain,
    active: branch.active,
  };
}

export function toCustomerView(customer: CustomerRecord): CustomerView {
  return {
    id: customer.id,
    documentType: customer.documentType,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[customer.documentType],
    documentNumber: customer.documentNumber,
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    city: customer.city,
    active: customer.active,
    seller: customer.seller,
    branches: customer.branches.map(toBranchView),
  };
}
