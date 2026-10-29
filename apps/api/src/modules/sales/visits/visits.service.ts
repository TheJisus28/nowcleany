import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { NotFoundError, ValidationError } from '../../../shared-kernel/index.js';
import { CustomersService } from '../customers/customers.service.js';
import { orderLabel } from '../domain/sales-order.js';
import { distanceMeters, ON_SITE_METERS, onSite } from '../domain/visit.js';
import { type VisitRecord, VisitsRepository } from './visits.repository.js';

export interface VisitView {
  readonly id: string;
  readonly seller: { id: string; name: string };
  readonly customer: { id: string; name: string };
  readonly branch: VisitRecord['branch'];
  readonly visitedAt: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  /** From the check-in to the branch; null when the branch has no location. */
  readonly distanceM: number | null;
  /** Within the on-site radius of the branch (null: cannot tell). */
  readonly onSite: boolean | null;
  readonly onSiteRadiusM: number;
  readonly notes: string | null;
  readonly order: { id: string; label: string } | null;
}

/** Seller visits, checked in with the phone's GPS at a customer's branch. */
@Injectable()
export class VisitsService {
  constructor(
    private readonly visits: VisitsRepository,
    private readonly customers: CustomersService,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async record(command: {
    customerId: string;
    branchId: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    notes?: string;
  }): Promise<VisitView> {
    const actor = this.currentActor.require();
    await this.customers.requireVisible(command.customerId);
    const branch = await this.customers.requireBranch(command.customerId, command.branchId);
    if (!branch.active) {
      throw new ValidationError('sales.inactive_branch', 'La sucursal está desactivada.');
    }
    const distance =
      branch.latitude === null || branch.longitude === null
        ? null
        : distanceMeters(command, { latitude: branch.latitude, longitude: branch.longitude });
    const id = await this.visits.insert({
      sellerId: actor.id,
      customerId: command.customerId,
      branchId: branch.id,
      latitude: command.latitude,
      longitude: command.longitude,
      accuracyM: command.accuracy === undefined ? null : Math.round(command.accuracy),
      distanceM: distance,
      notes: command.notes?.trim() ? command.notes.trim() : null,
    });
    return this.get(id);
  }

  /** A seller sees their own visits; visits:read-all sees everyone's (optionally one seller). */
  @Transactional()
  async list(filter: {
    sellerId?: string;
    customerId?: string;
    from?: string;
    to?: string;
  }): Promise<VisitView[]> {
    const actor = this.currentActor.require();
    const all = actor.system || actor.permissions.has('visits:read-all');
    const sellerId = all ? filter.sellerId : actor.id;
    const rows = await this.visits.list({
      limit: 1000,
      ...(sellerId ? { sellerId } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.from ? { from: new Date(`${filter.from}T00:00:00-05:00`) } : {}),
      // "to" is inclusive: up to the end of that day in Colombia.
      ...(filter.to
        ? { to: new Date(new Date(`${filter.to}T00:00:00-05:00`).getTime() + 86_400_000) }
        : {}),
    });
    return rows.map(toView);
  }

  @Transactional()
  async get(id: string): Promise<VisitView> {
    const visit = await this.visits.findById(id);
    const actor = this.currentActor.require();
    const all = actor.system || actor.permissions.has('visits:read-all');
    if (!visit || (!all && visit.sellerId !== actor.id)) {
      throw new NotFoundError('sales.visit_not_found', 'La visita no existe.');
    }
    return toView(visit);
  }
}

function toView(visit: VisitRecord): VisitView {
  return {
    id: visit.id,
    seller: { id: visit.sellerId, name: visit.sellerName },
    customer: { id: visit.customerId, name: visit.customerName },
    branch: visit.branch,
    visitedAt: visit.visitedAt.toISOString(),
    latitude: visit.latitude,
    longitude: visit.longitude,
    accuracyM: visit.accuracyM,
    distanceM: visit.distanceM,
    onSite: onSite(visit.distanceM, visit.accuracyM),
    onSiteRadiusM: ON_SITE_METERS,
    notes: visit.notes,
    order: visit.order ? { id: visit.order.id, label: orderLabel(visit.order.number) } : null,
  };
}
