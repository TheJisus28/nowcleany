import { Injectable } from '@nestjs/common';
import { toQuantityDto } from '../../../shared-kernel/index.js';
import { InventoryLedger } from '../../inventory/index.js';
import {
  type Capacity,
  PRODUCT_TYPE_LABELS,
  ProductCatalog,
  type ProductSummary,
} from '../../product/index.js';
import { type PlannedProduction, ProductionSchedule } from '../../production/index.js';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { type OnOrderLine, PurchasingBook } from '../../purchasing/index.js';
import { type OpenOrder, SalesDirectory } from '../../sales/index.js';
import {
  allocateCoverage,
  batches,
  COVERAGE_LABELS,
  type CoverageStatus,
  type DemandLine,
  type LineCoverage,
  max0,
  net,
  splitStock,
  sumBy,
  worstStatus,
} from '../domain/planning.js';
import type {
  Availability,
  BulkNeed,
  MaterialLine,
  OrderCoverageView,
  OversellReport,
  PackagingNeed,
  PlanningSummary,
  ProductionNeeds,
  ProductRef,
  PurchaseNeed,
  PurchaseNeeds,
  StockAllocation,
} from './planning-views.js';

interface Snapshot {
  readonly products: ReadonlyMap<string, ProductSummary>;
  readonly onHand: ReadonlyMap<string, bigint>;
  readonly orders: readonly OpenOrder[];
  readonly confirmed: readonly DemandLine[];
  readonly planned: readonly PlannedProduction[];
  readonly onOrder: readonly OnOrderLine[];
}

interface Plan {
  readonly demand: ReadonlyMap<string, bigint>;
  readonly toPack: ReadonlyMap<string, bigint>;
  readonly bulkRequired: ReadonlyMap<string, bigint>;
  readonly toProduce: ReadonlyMap<string, bigint>;
  readonly materialsRequired: ReadonlyMap<string, bigint>;
  readonly onOrder: ReadonlyMap<string, bigint>;
  readonly toBuy: ReadonlyMap<string, bigint>;
  readonly planned: ReadonlyMap<string, bigint>;
  readonly bulkCapacity: ReadonlyMap<string, Capacity>;
  readonly finishedCapacity: ReadonlyMap<string, Capacity>;
  readonly coverage: readonly LineCoverage[];
  readonly usedBy: ReadonlyMap<string, Set<string>>;
  readonly missingFormula: readonly string[];
}

/**
 * Read-only planning over the public APIs of product, inventory, sales, production and purchasing.
 * Computed on every request from live data (no derived state that could drift).
 */
@Injectable()
export class PlanningService {
  constructor(
    private readonly catalog: ProductCatalog,
    private readonly inventory: InventoryLedger,
    private readonly sales: SalesDirectory,
    private readonly production: ProductionSchedule,
    private readonly purchasing: PurchasingBook,
    private readonly currentActor: CurrentActor,
  ) {}

  /** Sellers only see their own orders in the planning views (the plan itself stays global). */
  private ownSeller(): string | undefined {
    const actor = this.currentActor.require();
    return actor.system || actor.permissions.has('sales-orders:read-all') ? undefined : actor.id;
  }

  async summary(): Promise<PlanningSummary> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    const byOrder = this.groupCoverage(plan.coverage);
    const ordersByCoverage: Record<CoverageStatus, number> = {
      COVERED: 0,
      NEEDS_PRODUCTION: 0,
      SHORT: 0,
    };
    for (const lines of byOrder.values())
      ordersByCoverage[worstStatus(lines.map((l) => l.status))]++;
    const uncovered = sumBy(
      plan.coverage,
      (l) => l.productId,
      (l) => l.uncovered,
    );
    return {
      generatedAt: new Date().toISOString(),
      confirmedOrders: byOrder.size,
      draftOrders: snapshot.orders.filter((order) => order.status === 'DRAFT').length,
      ordersByCoverage,
      oversoldProducts: [...uncovered.values()].filter((value) => value > 0n).length,
      productsToPack: [...plan.toPack.values()].filter((value) => value > 0n).length,
      bulksToProduce: [...plan.toProduce.values()].filter((value) => value > 0n).length,
      materialsToBuy: [...plan.toBuy.values()].filter((value) => value > 0n).length,
      plannedProductionOrders: snapshot.planned.length,
      purchaseOrdersInTransit: new Set(snapshot.onOrder.map((line) => line.orderId)).size,
      missingFormulas: plan.missingFormula.map((id) => this.ref(snapshot, id)),
    };
  }

  /** The proposal's report: sold per seller vs. what can be made, and what to buy for the rest. */
  async oversell(): Promise<OversellReport> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    const potential = sumBy(
      snapshot.orders.filter((order) => order.status === 'DRAFT').flatMap((order) => order.lines),
      (line) => line.productId,
      (line) => line.quantity,
    );
    const productIds = [...new Set([...plan.demand.keys(), ...potential.keys()])];
    const rows = [];
    for (const productId of productIds) {
      const product = snapshot.products.get(productId);
      if (!product) continue;
      const unit = product.stockUnit;
      const sold = plan.demand.get(productId) ?? 0n;
      const onHand = max0(snapshot.onHand.get(productId) ?? 0n);
      const capacity = plan.finishedCapacity.get(productId);
      const producible = capacity?.quantity ?? 0n;
      const uncovered = max0(sold - onHand - producible);
      const sellers = new Map<
        string,
        { sellerName: string; orders: Set<string>; quantity: bigint }
      >();
      for (const line of snapshot.confirmed.filter((l) => l.productId === productId)) {
        const entry = sellers.get(line.sellerId) ?? {
          sellerName: line.sellerName,
          orders: new Set(),
          quantity: 0n,
        };
        entry.orders.add(line.orderId);
        entry.quantity += line.quantity;
        sellers.set(line.sellerId, entry);
      }
      rows.push({
        product: this.ref(snapshot, productId),
        sold: toQuantityDto(sold, unit),
        potential: toQuantityDto(potential.get(productId) ?? 0n, unit),
        bySeller: [...sellers]
          .filter(([sellerId]) => {
            const own = this.ownSeller();
            return !own || sellerId === own;
          })
          .sort(([, a], [, b]) => (a.quantity > b.quantity ? -1 : 1))
          .map(([sellerId, entry]) => ({
            sellerId,
            sellerName: entry.sellerName,
            orders: entry.orders.size,
            quantity: toQuantityDto(entry.quantity, unit),
          })),
        onHand: toQuantityDto(onHand, unit),
        producible: toQuantityDto(producible, unit),
        capacity: toQuantityDto(onHand + producible, unit),
        uncovered: toQuantityDto(uncovered, unit),
        limitingMaterial: capacity?.limitingComponentId
          ? this.ref(snapshot, capacity.limitingComponentId)
          : null,
        materialsToCover:
          uncovered > 0n ? await this.rawMaterialsFor(snapshot, productId, uncovered) : [],
        sortKey: uncovered,
      });
    }
    // Quantities of different units cannot be compared: what needs action first, then by code.
    rows.sort(
      (a, b) =>
        Number(b.sortKey > 0n) - Number(a.sortKey > 0n) ||
        a.product.code.localeCompare(b.product.code),
    );
    return {
      generatedAt: new Date().toISOString(),
      rows: rows.map(({ sortKey: _sortKey, ...row }) => row),
    };
  }

  /** Each confirmed order, in priority order, with how its lines are covered. */
  async orderCoverage(): Promise<OrderCoverageView[]> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    let priority = 0;
    const own = this.ownSeller();
    const views = [...this.groupCoverage(plan.coverage).values()].map((lines) => {
      const first = lines[0];
      if (!first) throw new Error('Pedido sin líneas en la cobertura');
      const status = worstStatus(lines.map((line) => line.status));
      priority++;
      return {
        orderId: first.orderId,
        label: first.orderLabel,
        customerId: first.customerId,
        customerName: first.customerName,
        seller: { id: first.sellerId, name: first.sellerName },
        estimatedDeliveryDate: first.estimatedDeliveryDate,
        confirmedAt: first.confirmedAt?.toISOString() ?? null,
        priority,
        status,
        statusLabel: COVERAGE_LABELS[status],
        lines: lines.map((line) => {
          const unit = snapshot.products.get(line.productId)?.stockUnit ?? 'un';
          return {
            product: this.ref(snapshot, line.productId),
            quantity: toQuantityDto(line.quantity, unit),
            fromStock: toQuantityDto(line.fromStock, unit),
            fromProduction: toQuantityDto(line.fromProduction, unit),
            uncovered: toQuantityDto(line.uncovered, unit),
            status: line.status,
            statusLabel: COVERAGE_LABELS[line.status],
          };
        }),
      };
    });
    return own ? views.filter((view) => view.seller.id === own) : views;
  }

  /** Plant: what to package and which bulk to produce, against what is already scheduled. */
  async productionNeeds(): Promise<ProductionNeeds> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    const packaging: PackagingNeed[] = [...plan.demand.keys()].flatMap((productId) => {
      const product = snapshot.products.get(productId);
      if (product?.type !== 'FINISHED_GOOD') return [];
      const unit = product.stockUnit;
      const toPack = plan.toPack.get(productId) ?? 0n;
      const planned = plan.planned.get(productId) ?? 0n;
      const capacity = plan.finishedCapacity.get(productId);
      let stockLeft = max0(snapshot.onHand.get(productId) ?? 0n);
      const orders = plan.coverage
        .filter((line) => line.productId === productId)
        .map((line) => {
          const fromStock = line.quantity < stockLeft ? line.quantity : stockLeft;
          stockLeft -= fromStock;
          return {
            orderId: line.orderId,
            label: line.orderLabel,
            customerId: line.customerId,
            customerName: line.customerName,
            sellerName: line.sellerName,
            estimatedDeliveryDate: line.estimatedDeliveryDate,
            quantity: toQuantityDto(line.quantity, unit),
            toProduce: toQuantityDto(line.quantity - fromStock, unit),
          };
        });
      return [
        {
          product: this.ref(snapshot, productId),
          demand: toQuantityDto(plan.demand.get(productId) ?? 0n, unit),
          onHand: toQuantityDto(snapshot.onHand.get(productId) ?? 0n, unit),
          toPack: toQuantityDto(toPack, unit),
          planned: toQuantityDto(planned, unit),
          pendingToSchedule: toQuantityDto(max0(toPack - planned), unit),
          canMakeNow: toQuantityDto(capacity?.quantity ?? 0n, unit),
          limitingMaterial: capacity?.limitingComponentId
            ? this.ref(snapshot, capacity.limitingComponentId)
            : null,
          orders,
        },
      ];
    });
    const bulkIds = new Set([
      ...plan.bulkRequired.keys(),
      ...[...plan.planned.keys()].filter((id) => snapshot.products.get(id)?.type === 'BULK'),
    ]);
    const bulk: BulkNeed[] = [...bulkIds].flatMap((productId) => {
      const product = snapshot.products.get(productId);
      if (!product) return [];
      const unit = product.stockUnit;
      const toProduce = plan.toProduce.get(productId) ?? 0n;
      const planned = plan.planned.get(productId) ?? 0n;
      const pending = max0(toProduce - planned);
      const capacity = plan.bulkCapacity.get(productId);
      return [
        {
          product: this.ref(snapshot, productId),
          required: toQuantityDto(plan.bulkRequired.get(productId) ?? 0n, unit),
          onHand: toQuantityDto(snapshot.onHand.get(productId) ?? 0n, unit),
          toProduce: toQuantityDto(toProduce, unit),
          planned: toQuantityDto(planned, unit),
          pendingToSchedule: toQuantityDto(pending, unit),
          batchCapacity:
            product.batchCapacity === null ? null : toQuantityDto(product.batchCapacity, unit),
          batchesPending: batches(pending, product.batchCapacity),
          canMakeNow: toQuantityDto(capacity?.quantity ?? 0n, unit),
          limitingMaterial: capacity?.limitingComponentId
            ? this.ref(snapshot, capacity.limitingComponentId)
            : null,
          usedBy: [...(plan.usedBy.get(productId) ?? [])].map((id) => this.ref(snapshot, id)),
        },
      ];
    });
    const byPending = (
      a: { pendingToSchedule: { quantity: string } },
      b: { pendingToSchedule: { quantity: string } },
    ) => Number(b.pendingToSchedule.quantity) - Number(a.pendingToSchedule.quantity);
    return {
      generatedAt: new Date().toISOString(),
      packaging: packaging.sort(byPending),
      bulk: bulk.sort(byPending),
    };
  }

  /** Purchasing: exactly the net shortage of each raw material, after stock and what is in transit. */
  async purchaseNeeds(): Promise<PurchaseNeeds> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    const ids = new Set([...plan.materialsRequired.keys(), ...plan.onOrder.keys()]);
    const rows: (PurchaseNeed & { sortKey: bigint })[] = [...ids].flatMap((productId) => {
      const product = snapshot.products.get(productId);
      if (product?.type !== 'RAW_MATERIAL') return [];
      const unit = product.stockUnit;
      const toBuy = plan.toBuy.get(productId) ?? 0n;
      return [
        {
          product: this.ref(snapshot, productId),
          required: toQuantityDto(plan.materialsRequired.get(productId) ?? 0n, unit),
          onHand: toQuantityDto(snapshot.onHand.get(productId) ?? 0n, unit),
          onOrder: toQuantityDto(plan.onOrder.get(productId) ?? 0n, unit),
          toBuy: toQuantityDto(toBuy, unit),
          usedBy: [...(plan.usedBy.get(productId) ?? [])].map((id) => this.ref(snapshot, id)),
          inTransit: snapshot.onOrder
            .filter((line) => line.productId === productId)
            .map((line) => ({
              orderId: line.orderId,
              label: line.label,
              supplier: line.supplier,
              expectedDate: line.expectedDate,
              quantity: toQuantityDto(line.quantity, unit),
            })),
          sortKey: toBuy,
        },
      ];
    });
    // Quantities of different units cannot be compared: what needs action first, then by code.
    rows.sort(
      (a, b) =>
        Number(b.sortKey > 0n) - Number(a.sortKey > 0n) ||
        a.product.code.localeCompare(b.product.code),
    );
    return {
      generatedAt: new Date().toISOString(),
      rows: rows.map(({ sortKey: _sortKey, ...row }) => row),
    };
  }

  /** Sales: how much of each finished good can still be promised with stock and materials on hand. */
  async availability(): Promise<Availability> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    const rows = [...snapshot.products.values()]
      .filter((product) => product.type === 'FINISHED_GOOD' && product.active)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((product) => {
        const unit = product.stockUnit;
        const onHand = snapshot.onHand.get(product.id) ?? 0n;
        const committed = plan.demand.get(product.id) ?? 0n;
        const capacity = plan.finishedCapacity.get(product.id);
        const producible = capacity?.quantity ?? 0n;
        return {
          product: this.ref(snapshot, product.id),
          onHand: toQuantityDto(onHand, unit),
          committed: toQuantityDto(committed, unit),
          producible: toQuantityDto(producible, unit),
          promisable: toQuantityDto(max0(max0(onHand) + producible - committed), unit),
          limitingMaterial: capacity?.limitingComponentId
            ? this.ref(snapshot, capacity.limitingComponentId)
            : null,
        };
      });
    return { generatedAt: new Date().toISOString(), rows };
  }

  /**
   * What each product's stock is for: set aside for scheduled production, needed by confirmed orders,
   * idle, or missing. Computed from the same plan as the other views (nothing is reserved here).
   */
  async stockAllocation(): Promise<StockAllocation> {
    const snapshot = await this.snapshot();
    const plan = await this.plan(snapshot);
    // What the scheduled orders will consume (one level, like recording the production would).
    const scheduled = sumBy(
      (
        await this.catalog.requirementsFor(
          snapshot.planned.map((order) => ({
            productId: order.productId,
            quantity: order.quantity,
          })),
        )
      ).needs,
      (need) => need.componentId,
      (need) => need.quantity,
    );
    const rows = [...snapshot.products.values()]
      .filter((product) => product.active)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((product) => {
        const unit = product.stockUnit;
        const id = product.id;
        const required =
          product.type === 'RAW_MATERIAL'
            ? (plan.materialsRequired.get(id) ?? 0n)
            : product.type === 'BULK'
              ? (plan.bulkRequired.get(id) ?? 0n)
              : (plan.demand.get(id) ?? 0n);
        const onHand = snapshot.onHand.get(id) ?? 0n;
        const split = splitStock(
          onHand,
          required,
          product.type === 'FINISHED_GOOD' ? 0n : (scheduled.get(id) ?? 0n),
        );
        const incoming =
          product.type === 'RAW_MATERIAL'
            ? (plan.onOrder.get(id) ?? 0n)
            : (plan.planned.get(id) ?? 0n);
        return {
          product: this.ref(snapshot, id),
          type: product.type,
          typeLabel: PRODUCT_TYPE_LABELS[product.type],
          onHand: toQuantityDto(onHand, unit),
          forProduction: toQuantityDto(split.forProduction, unit),
          forOrders: toQuantityDto(split.forOrders, unit),
          idle: toQuantityDto(split.idle, unit),
          missing: toQuantityDto(split.missing, unit),
          incoming: toQuantityDto(incoming, unit),
        };
      });
    return { generatedAt: new Date().toISOString(), rows };
  }

  // --- computation ---------------------------------------------------------------------------

  private async snapshot(): Promise<Snapshot> {
    const [products, levels, orders, planned, onOrder] = await Promise.all([
      this.catalog.list(),
      this.inventory.stockLevels(),
      this.sales.openOrders(),
      this.production.planned(),
      this.purchasing.onOrder(),
    ]);
    const confirmed: DemandLine[] = orders
      .filter((order) => order.status === 'CONFIRMED')
      .flatMap((order) =>
        order.lines.map((line) => ({
          orderId: order.id,
          orderLabel: order.label,
          customerId: order.customerId,
          customerName: order.customerName,
          sellerId: order.seller.id,
          sellerName: order.seller.name,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          confirmedAt: order.confirmedAt,
          productId: line.productId,
          quantity: line.quantity,
        })),
      );
    return {
      products: new Map(products.map((product) => [product.id, product])),
      onHand: new Map(levels.map((level) => [level.productId, level.onHand])),
      orders,
      confirmed,
      planned,
      onOrder,
    };
  }

  private async plan(snapshot: Snapshot): Promise<Plan> {
    const onHand = (id: string): bigint => snapshot.onHand.get(id) ?? 0n;
    const typeOf = (id: string) => snapshot.products.get(id)?.type;

    // 1. Finished goods: confirmed demand not covered by stock must be packaged.
    const demand = sumBy(
      snapshot.confirmed,
      (line) => line.productId,
      (line) => line.quantity,
    );
    const toPack = new Map([...demand].map(([id, quantity]) => [id, net(quantity, onHand(id))]));

    // 2. Packaging needs bulk liquid and packaging materials.
    const level1 = await this.catalog.requirementsFor(
      [...toPack].map(([productId, quantity]) => ({ productId, quantity })),
    );
    const bulkRequired = new Map(
      level1.needs
        .filter((need) => typeOf(need.componentId) === 'BULK')
        .map((n) => [n.componentId, n.quantity]),
    );
    const toProduce = new Map(
      [...bulkRequired].map(([id, quantity]) => [id, net(quantity, onHand(id))]),
    );

    // 3. Producing the missing bulk needs chemicals.
    const level2 = await this.catalog.requirementsFor(
      [...toProduce].map(([productId, quantity]) => ({ productId, quantity })),
    );
    const materialsRequired = sumBy(
      [...level1.needs, ...level2.needs].filter(
        (need) => typeOf(need.componentId) === 'RAW_MATERIAL',
      ),
      (need) => need.componentId,
      (need) => need.quantity,
    );

    // 4. Purchases: the exact net shortage after stock and what is already on its way.
    const onOrder = sumBy(
      snapshot.onOrder,
      (line) => line.productId,
      (line) => line.quantity,
    );
    const toBuy = new Map(
      [...materialsRequired].map(([id, quantity]) => [
        id,
        net(quantity, onHand(id), onOrder.get(id) ?? 0n),
      ]),
    );

    // 5. Capacity with what is available now: bulk from chemicals, finished goods from bulk + packaging.
    const ids = (type: ProductSummary['type']) =>
      [...snapshot.products.values()].filter((p) => p.type === type && p.active).map((p) => p.id);
    const bulkCapacity = await this.catalog.capacityFor(ids('BULK'), snapshot.onHand);
    const withBulk = new Map(snapshot.onHand);
    for (const [bulkId, capacity] of bulkCapacity)
      withBulk.set(bulkId, max0(onHand(bulkId)) + capacity.quantity);
    const finishedCapacity = await this.catalog.capacityFor(ids('FINISHED_GOOD'), withBulk);

    // 6. Coverage of each confirmed order line, by delivery priority.
    const coverage = allocateCoverage(
      snapshot.confirmed,
      snapshot.onHand,
      new Map([...finishedCapacity].map(([id, capacity]) => [id, capacity.quantity])),
    );

    return {
      demand,
      toPack,
      bulkRequired,
      toProduce,
      materialsRequired,
      onOrder,
      toBuy,
      planned: sumBy(
        snapshot.planned,
        (order) => order.productId,
        (order) => order.quantity,
      ),
      bulkCapacity,
      finishedCapacity,
      coverage,
      usedBy: await this.usedBy(
        [...toPack, ...toProduce].filter(([, quantity]) => quantity > 0n).map(([id]) => id),
      ),
      missingFormula: [...new Set([...level1.missingFormula, ...level2.missingFormula])],
    };
  }

  /** Which products (being packaged or produced) consume each component. */
  private async usedBy(productIds: readonly string[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    for (const [productId, components] of await this.catalog.componentsOf(productIds)) {
      for (const componentId of components) {
        const users = result.get(componentId) ?? new Set<string>();
        users.add(productId);
        result.set(componentId, users);
      }
    }
    return result;
  }

  /** Raw materials (exploding bulk) to make `quantity` of a finished good, gross. */
  private async rawMaterialsFor(
    snapshot: Snapshot,
    productId: string,
    quantity: bigint,
  ): Promise<MaterialLine[]> {
    const first = await this.catalog.requirementsFor([{ productId, quantity }]);
    const bulk = first.needs.filter(
      (need) => snapshot.products.get(need.componentId)?.type === 'BULK',
    );
    const second = await this.catalog.requirementsFor(
      bulk.map((need) => ({ productId: need.componentId, quantity: need.quantity })),
    );
    const totals = sumBy(
      [...first.needs.filter((need) => !bulk.includes(need)), ...second.needs],
      (need) => need.componentId,
      (need) => need.quantity,
    );
    return [...totals].flatMap(([id, total]) => {
      const product = snapshot.products.get(id);
      if (!product) return [];
      return [
        {
          ...this.ref(snapshot, id),
          typeLabel: PRODUCT_TYPE_LABELS[product.type],
          quantity: toQuantityDto(total, product.stockUnit),
        },
      ];
    });
  }

  private groupCoverage(lines: readonly LineCoverage[]): Map<string, LineCoverage[]> {
    const byOrder = new Map<string, LineCoverage[]>();
    for (const line of lines)
      byOrder.set(line.orderId, [...(byOrder.get(line.orderId) ?? []), line]);
    return byOrder;
  }

  private ref(snapshot: Snapshot, id: string): ProductRef {
    const product = snapshot.products.get(id);
    return { id, code: product?.code ?? '?', name: product?.name ?? 'Producto desconocido' };
  }
}
