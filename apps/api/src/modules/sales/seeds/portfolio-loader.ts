import { Injectable } from '@nestjs/common';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { type DirectoryUser, UserDirectory } from '../../identity/index.js';
import { ProductCatalog } from '../../product/index.js';
import { CustomersRepository } from '../customers/customers.repository.js';
import { CustomersService } from '../customers/customers.service.js';
import type { DocumentType } from '../domain/customer.js';
import { distanceMeters } from '../domain/visit.js';
import { SalesOrdersService } from '../orders/sales-orders.service.js';
import { VisitsRepository } from '../visits/visits.repository.js';

export type SellerKey = 'a' | 'b' | 'c' | 'd';

const SELLER_EMAILS: Record<SellerKey, string> = {
  a: 'vendedor.a@nowcleany.local',
  b: 'vendedor.b@nowcleany.local',
  c: 'vendedor.c@nowcleany.local',
  d: 'vendedor.d@nowcleany.local',
};

export interface SeedBranch {
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface SeedCustomer {
  seller: SellerKey;
  documentType: DocumentType;
  documentNumber: string;
  name: string;
  phone: string;
  /** The first one is the main branch (its address is the customer's). */
  branches: readonly [SeedBranch, ...SeedBranch[]];
}

export type SeedOutcome = 'confirm' | 'draft' | 'cancel';

export interface SeedOrder {
  /** Document number of the customer; the seller is the customer's owner. */
  customer: string;
  /** Branch name; the main branch when omitted. */
  branch?: string;
  inDays: number;
  outcome: SeedOutcome;
  lines: readonly (readonly [code: string, quantity: string])[];
  cancelReason?: string;
  notes?: string;
}

/** Deterministic pseudo-random numbers, so every seeded database looks the same. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** A point `meters` away from `origin` in a pseudo-random direction. */
function around(
  origin: { latitude: number; longitude: number },
  meters: number,
  next: () => number,
): { latitude: number; longitude: number } {
  const angle = next() * 2 * Math.PI;
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLon = (meters * Math.sin(angle)) / (111_320 * Math.cos((origin.latitude * Math.PI) / 180));
  return { latitude: origin.latitude + dLat, longitude: origin.longitude + dLon };
}

/**
 * DATOS DE EJEMPLO: loads customers into each seller's portfolio, their branches, orders taken by the
 * owner of each customer and visit history, through the module's own services.
 */
@Injectable()
export class PortfolioLoader {
  constructor(
    private readonly users: UserDirectory,
    private readonly catalog: ProductCatalog,
    private readonly customersRepository: CustomersRepository,
    private readonly customers: CustomersService,
    private readonly orders: SalesOrdersService,
    private readonly visits: VisitsRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  async loadCustomers(list: readonly SeedCustomer[]): Promise<number> {
    const sellers = await this.sellers();
    let created = 0;
    for (const customer of list) {
      if (await this.customersRepository.findByDocument(customer.documentNumber)) continue;
      const [main, ...others] = customer.branches;
      await this.asSeller(sellers, customer.seller, async () => {
        const saved = await this.customers.create({
          documentType: customer.documentType,
          documentNumber: customer.documentNumber,
          name: customer.name,
          address: main.address,
          city: main.city,
          phone: customer.phone,
          location: { latitude: main.latitude, longitude: main.longitude },
        });
        for (const branch of others) {
          await this.customers.addBranch(saved.id, {
            name: branch.name,
            address: branch.address,
            city: branch.city,
            phone: customer.phone,
            latitude: branch.latitude,
            longitude: branch.longitude,
          });
        }
      });
      created++;
    }
    return created;
  }

  /** Orders taken by each customer's owner; most of them during a visit at the branch. */
  async loadOrders(list: readonly SeedOrder[]): Promise<string[]> {
    const ids: string[] = [];
    const sellers = await this.sellers();
    const products = new Map(
      (await this.catalog.findByCodes(list.flatMap((o) => o.lines.map(([code]) => code)))).map(
        (p) => [p.code, p.id],
      ),
    );
    const next = random(list.length * 7919);
    for (const [index, order] of list.entries()) {
      const customer = await this.customersRepository.findByDocument(order.customer);
      if (!customer?.seller) throw new Error(`Cliente de ejemplo ${order.customer} sin vendedor`);
      const sellerKey = (Object.keys(SELLER_EMAILS) as SellerKey[]).find(
        (key) => sellers.get(key)?.id === customer.seller?.id,
      );
      if (!sellerKey) throw new Error(`Vendedor de ${order.customer} no encontrado`);
      const branch = customer.branches.find((b) => b.name === order.branch) ?? customer.branches[0];
      if (!branch) throw new Error(`Cliente ${order.customer} sin sucursales`);
      await this.asSeller(sellers, sellerKey, async (seller) => {
        // Taken in person (most of them): a visit at the branch a few hours before.
        let visitId: string | undefined;
        if (index % 4 !== 3 && branch.latitude !== null && branch.longitude !== null) {
          const at = around(
            { latitude: branch.latitude, longitude: branch.longitude },
            15 + next() * 50,
            next,
          );
          visitId = await this.visits.insert({
            sellerId: seller.id,
            customerId: customer.id,
            branchId: branch.id,
            ...at,
            accuracyM: Math.round(8 + next() * 20),
            distanceM: distanceMeters(at, {
              latitude: branch.latitude,
              longitude: branch.longitude,
            }),
            notes: null,
            visitedAt: new Date(Date.now() - (1 + next() * 5) * 3_600_000),
          });
        }
        const created = await this.orders.create({
          customerId: customer.id,
          branchId: branch.id,
          ...(visitId ? { visitId } : {}),
          estimatedDeliveryDate: inDays(order.inDays),
          ...(order.notes ? { notes: order.notes } : {}),
          lines: order.lines.map(([code, quantity]) => ({
            productId: products.get(code) ?? '',
            quantity,
          })),
        });
        ids.push(created.id);
        if (order.outcome === 'draft') return;
        await this.orders.confirm(created.id);
        if (order.outcome === 'cancel')
          await this.orders.cancel(created.id, order.cancelReason ?? 'Anulada');
      });
    }
    return ids;
  }

  /**
   * Visit history of the last `days` days (no Sundays): most in person at the branch, a few checked in
   * from far away, so the map shows both.
   */
  async loadVisitHistory(days: number): Promise<number> {
    const sellers = await this.sellers();
    const next = random(424_242);
    let count = 0;
    for (const [key, seller] of sellers) {
      const portfolio = await this.customersRepository.list({ sellerId: seller.id });
      const branches = portfolio.flatMap((customer) =>
        customer.branches
          .filter((branch) => branch.latitude !== null && branch.longitude !== null)
          .map((branch) => ({ customer, branch })),
      );
      if (branches.length === 0) continue;
      for (let day = days; day >= 1; day--) {
        const date = new Date(Date.now() - day * 86_400_000);
        if (date.getUTCDay() === 0) continue;
        const visitsToday = 2 + Math.floor(next() * 3);
        for (let i = 0; i < visitsToday; i++) {
          const target = branches[Math.floor(next() * branches.length)];
          if (!target) continue;
          const origin = {
            latitude: target.branch.latitude ?? 0,
            longitude: target.branch.longitude ?? 0,
          };
          // Seller C checks in from far away more often: that is what the map should reveal.
          const far = next() < (key === 'c' ? 0.35 : 0.08);
          const at = around(origin, far ? 900 + next() * 3500 : 10 + next() * 60, next);
          // Between 8:00 and 17:00 in Colombia (UTC-5).
          const visitedAt = new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 13, 0) +
              (i * 2.2 + next()) * 3_600_000,
          );
          await this.visits.insert({
            sellerId: seller.id,
            customerId: target.customer.id,
            branchId: target.branch.id,
            ...at,
            accuracyM: Math.round(6 + next() * 25),
            distanceM: distanceMeters(at, origin),
            notes: far
              ? null
              : next() < 0.3
                ? 'Revisó inventario de la tienda y pidió reposición.'
                : null,
            visitedAt,
          });
          count++;
        }
      }
    }
    return count;
  }

  private async sellers(): Promise<Map<SellerKey, DirectoryUser>> {
    const found = await this.users.findByEmails(Object.values(SELLER_EMAILS));
    const byEmail = new Map(found.map((user) => [user.email, user]));
    const result = new Map<SellerKey, DirectoryUser>();
    for (const [key, email] of Object.entries(SELLER_EMAILS) as [SellerKey, string][]) {
      const user = byEmail.get(email);
      if (user) result.set(key, user);
    }
    return result;
  }

  private asSeller<T>(
    sellers: ReadonlyMap<SellerKey, DirectoryUser>,
    key: SellerKey,
    fn: (seller: DirectoryUser) => Promise<T>,
  ): Promise<T> {
    const seller = sellers.get(key);
    if (!seller) throw new Error(`Vendedor de ejemplo ${key} no encontrado`);
    return this.currentActor.runAs(
      {
        id: seller.id,
        displayName: seller.fullName,
        permissions: new Set(seller.permissions),
        system: false,
      },
      () => fn(seller),
    );
  }
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
