import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import {
  normaliseDecimal,
  NotFoundError,
  parseCsv,
  Quantity,
  unit,
  ValidationError,
} from '../../../shared-kernel/index.js';
import { ProductCatalog, type ProductSummary } from '../../product/index.js';
import {
  adjustmentDelta,
  type Balance,
  DISPATCH_WAREHOUSE,
  type MovementType,
  PLANT_WAREHOUSE,
  requireDifferentWarehouses,
  requirePositive,
  requireReason,
} from '../domain/stock.js';
import {
  type MovementView,
  type StockStatusView,
  toMovementView,
  toStatusView,
} from './stock-view.js';
import {
  balanceKey,
  type BalanceKey,
  type MovementFilter,
  type NewMovement,
  StockRepository,
  type Warehouse,
} from './stock.repository.js';

export interface QuantityInput {
  readonly productId: string;
  /** Decimal string in `unit` (defaults to the product's stock unit). */
  readonly quantity: string;
  readonly unit?: string;
}

/** Base-unit quantities exchanged with other modules. */
export interface StockLine {
  readonly productId: string;
  readonly quantity: bigint;
}

export interface Reference {
  readonly type: string;
  readonly id: string;
  readonly label: string;
}

export interface OperationResult {
  readonly operationId: string;
  /** False when the idempotency key had already been used: nothing was applied this time. */
  readonly applied: boolean;
}

interface Entry extends BalanceKey {
  readonly type?: MovementType;
  readonly delta: bigint;
  readonly reservedDelta?: bigint;
}

@Injectable()
export class StockService {
  constructor(
    private readonly stock: StockRepository,
    private readonly catalog: ProductCatalog,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  warehouses(): Promise<Warehouse[]> {
    return this.stock.warehouses();
  }

  @Transactional()
  async status(filter: {
    type?: ProductSummary['type'];
    search?: string;
  }): Promise<StockStatusView[]> {
    const products = (
      await this.catalog.list({ active: true, ...(filter.type ? { type: filter.type } : {}) })
    ).filter((product) => matches(product, filter.search));
    const [balances, warehouses] = await Promise.all([
      this.stock.balances(products.map((product) => product.id)),
      this.stock.warehouses(),
    ]);
    return products.map((product) =>
      toStatusView(
        product,
        balances.filter((balance) => balance.productId === product.id),
        warehouses,
      ),
    );
  }

  @Transactional()
  async movements(
    filter: Omit<MovementFilter, 'warehouseId'> & { warehouseCode?: string },
  ): Promise<MovementView[]> {
    const warehouses = await this.stock.warehouses();
    const warehouse = filter.warehouseCode
      ? this.warehouse(warehouses, filter.warehouseCode)
      : undefined;
    const { warehouseCode: _ignored, ...rest } = filter;
    const rows = await this.stock.movements({
      ...rest,
      ...(warehouse ? { warehouseId: warehouse.id } : {}),
    });
    const products = new Map(
      (await this.catalog.findByIds(rows.map((row) => row.productId))).map((p) => [p.id, p]),
    );
    return rows.map((row) =>
      toMovementView(
        row,
        products.get(row.productId),
        warehouses.find((w) => w.id === row.warehouseId),
      ),
    );
  }

  /** Raw-material receipt (default warehouse PLANTA). */
  @Transactional()
  async receive(command: {
    warehouseCode?: string;
    lines: readonly QuantityInput[];
    reference?: Reference;
    note?: string;
    idempotencyKey?: string;
  }): Promise<OperationResult> {
    const warehouse = this.warehouse(
      await this.stock.warehouses(),
      command.warehouseCode ?? PLANT_WAREHOUSE,
    );
    const lines = await this.resolve(command.lines);
    return this.post({
      kind: 'RECEIPT',
      key: command.idempotencyKey,
      reference: command.reference ?? null,
      note: command.note ?? null,
      entries: lines.map((line) => ({
        warehouseId: warehouse.id,
        productId: line.product.id,
        type: 'RECEIPT',
        delta: requirePositive(line.quantity, line.product.code).base,
      })),
    });
  }

  /** Output of a production or packaging order and the consumption of its formula, in PLANTA. */
  @Transactional()
  async recordProduction(command: {
    idempotencyKey: string;
    output: StockLine;
    consumptions: readonly StockLine[];
    reference: Reference;
    note?: string;
  }): Promise<OperationResult> {
    const plant = this.warehouse(await this.stock.warehouses(), PLANT_WAREHOUSE);
    return this.post({
      kind: 'PRODUCTION',
      key: command.idempotencyKey,
      reference: command.reference,
      note: command.note ?? null,
      entries: [
        {
          warehouseId: plant.id,
          productId: command.output.productId,
          type: 'PRODUCTION_OUTPUT',
          delta: command.output.quantity,
        },
        ...command.consumptions.map((line) => ({
          warehouseId: plant.id,
          productId: line.productId,
          type: 'PRODUCTION_CONSUMPTION' as const,
          delta: -line.quantity,
        })),
      ],
    });
  }

  /** Delivery of finished goods from the plant to the dispatch warehouse (or any other pair). */
  @Transactional()
  async transfer(command: {
    line: QuantityInput;
    fromCode?: string;
    toCode?: string;
    note?: string;
  }): Promise<OperationResult> {
    const warehouses = await this.stock.warehouses();
    const fromCode = command.fromCode ?? PLANT_WAREHOUSE;
    const toCode = command.toCode ?? DISPATCH_WAREHOUSE;
    requireDifferentWarehouses(fromCode, toCode);
    const [from, to] = [this.warehouse(warehouses, fromCode), this.warehouse(warehouses, toCode)];
    const [line] = await this.resolve([command.line]);
    if (!line) throw new Error('Línea de traslado vacía');
    const quantity = requirePositive(line.quantity, line.product.code).base;
    return this.post({
      kind: 'TRANSFER',
      reference: null,
      note: command.note ?? null,
      entries: [
        {
          warehouseId: from.id,
          productId: line.product.id,
          type: 'TRANSFER_OUT',
          delta: -quantity,
        },
        { warehouseId: to.id, productId: line.product.id, type: 'TRANSFER_IN', delta: quantity },
      ],
    });
  }

  /** Physical count: sets the balance to the counted quantity and records the difference. */
  @Transactional()
  async adjust(command: {
    line: QuantityInput;
    warehouseCode: string;
    reason: string;
  }): Promise<OperationResult> {
    const warehouse = this.warehouse(await this.stock.warehouses(), command.warehouseCode);
    const reason = requireReason(command.reason);
    const [line] = await this.resolve([command.line]);
    if (!line) throw new Error('Línea de ajuste vacía');
    const key = { warehouseId: warehouse.id, productId: line.product.id };
    const balances = await this.stock.lockBalances([key]);
    const delta = adjustmentDelta(balances.get(balanceKey(key))?.onHand ?? 0n, line.quantity);
    return this.post({
      kind: 'ADJUSTMENT',
      reference: null,
      note: reason,
      entries: [{ ...key, type: 'ADJUSTMENT', delta }],
    });
  }

  /**
   * Initial stock from a CSV (codigo; cantidad; [bodega]). Sets each balance to the given quantity.
   * All rows are validated first; with any error nothing is loaded.
   */
  @Transactional()
  async initialLoad(csv: string): Promise<{ rows: number; movements: number }> {
    const rows = parseCsv(csv, ['codigo', 'cantidad']);
    if (rows.length === 0) {
      throw new ValidationError('inventory.load_empty', 'El archivo no tiene filas.');
    }
    const warehouses = await this.stock.warehouses();
    const products = new Map(
      (
        await this.catalog.findByCodes(
          rows.map((row) => (row.values['codigo'] ?? '').toUpperCase()),
        )
      ).map((p) => [p.code, p]),
    );
    const errors: { line: number; message: string }[] = [];
    const targets: { key: BalanceKey; quantity: bigint }[] = [];
    for (const row of rows) {
      try {
        const code = (row.values['codigo'] ?? '').toUpperCase();
        const product = products.get(code);
        if (!product)
          throw new ValidationError('inventory.unknown_product', `No existe el producto ${code}.`);
        const warehouse = this.warehouse(
          warehouses,
          (row.values['bodega'] ?? '') || PLANT_WAREHOUSE,
        );
        const quantity = Quantity.parse(
          normaliseDecimal(row.values['cantidad'] ?? ''),
          product.stockUnit,
        );
        if (quantity.isNegative()) {
          throw new ValidationError(
            'inventory.negative_load',
            'La cantidad inicial no puede ser negativa.',
          );
        }
        targets.push({
          key: { warehouseId: warehouse.id, productId: product.id },
          quantity: quantity.base,
        });
      } catch (error) {
        if (!(error instanceof ValidationError || error instanceof NotFoundError)) throw error;
        errors.push({ line: row.line, message: error.message });
      }
    }
    if (errors.length > 0) {
      throw new ValidationError(
        'inventory.load_invalid',
        `El archivo tiene ${String(errors.length)} fila(s) con errores; no se cargó nada.`,
        { errors },
      );
    }
    const balances = await this.stock.lockBalances(targets.map((target) => target.key));
    const entries = targets
      .map((target) => ({
        ...target.key,
        type: 'INITIAL_LOAD' as const,
        delta: target.quantity - (balances.get(balanceKey(target.key))?.onHand ?? 0n),
      }))
      .filter((entry) => entry.delta !== 0n);
    await this.post({
      kind: 'INITIAL_LOAD',
      reference: null,
      note: 'Carga inicial por archivo',
      entries,
    });
    return { rows: rows.length, movements: entries.length };
  }

  /**
   * Commits finished goods to a sales order. Never fails for lack of stock (overselling is allowed) and
   * is idempotent: an order that already has reservations is left as is.
   */
  @Transactional()
  async reserve(command: {
    orderId: string;
    orderLabel: string;
    lines: readonly StockLine[];
  }): Promise<{ alreadyReserved: boolean }> {
    await this.stock.lockOrder(command.orderId);
    if ((await this.stock.reservationsOf(command.orderId)).length > 0)
      return { alreadyReserved: true };
    const dispatch = this.warehouse(await this.stock.warehouses(), DISPATCH_WAREHOUSE);
    const lines = mergeLines(command.lines);
    await this.applyReserved(
      lines.map((line) => ({
        warehouseId: dispatch.id,
        productId: line.productId,
        delta: 0n,
        reservedDelta: line.quantity,
      })),
    );
    await this.stock.insertReservations(
      lines.map((line) => ({
        orderId: command.orderId,
        orderLabel: command.orderLabel,
        productId: line.productId,
        warehouseId: dispatch.id,
        quantity: line.quantity,
      })),
    );
    return { alreadyReserved: false };
  }

  /** Releases an order's reservations (cancelled, or abandoned in draft). Idempotent. */
  @Transactional()
  async release(orderId: string): Promise<{ released: boolean }> {
    await this.stock.lockOrder(orderId);
    const reservations = await this.stock.reservationsOf(orderId);
    if (reservations.length === 0) return { released: false };
    await this.applyReserved(
      reservations.map((r) => ({
        warehouseId: r.warehouseId,
        productId: r.productId,
        delta: 0n,
        reservedDelta: -r.quantity,
      })),
    );
    await this.stock.deleteReservations(orderId);
    return { released: true };
  }

  /** Ships an order from DESPACHO: stock goes out and its reservations are consumed. */
  @Transactional()
  async dispatch(command: {
    idempotencyKey: string;
    orderId: string;
    reference: Reference;
    lines: readonly StockLine[];
  }): Promise<OperationResult> {
    await this.stock.lockOrder(command.orderId);
    const dispatch = this.warehouse(await this.stock.warehouses(), DISPATCH_WAREHOUSE);
    const reservations = await this.stock.reservationsOf(command.orderId);
    const lines = mergeLines(command.lines);
    const result = await this.post({
      kind: 'DISPATCH',
      key: command.idempotencyKey,
      reference: command.reference,
      note: null,
      entries: [
        ...lines.map((line) => ({
          warehouseId: dispatch.id,
          productId: line.productId,
          type: 'DISPATCH' as const,
          delta: -line.quantity,
        })),
        ...reservations.map((r) => ({
          warehouseId: r.warehouseId,
          productId: r.productId,
          delta: 0n,
          reservedDelta: -r.quantity,
        })),
      ],
    });
    if (result.applied) await this.stock.deleteReservations(command.orderId);
    return result;
  }

  /** Totals across warehouses, for planning. */
  @Transactional()
  async levels(
    productIds?: readonly string[],
  ): Promise<{ productId: string; onHand: bigint; reserved: bigint }[]> {
    const totals = new Map<string, Balance>();
    for (const balance of await this.stock.balances(productIds)) {
      const current = totals.get(balance.productId) ?? { onHand: 0n, reserved: 0n };
      totals.set(balance.productId, {
        onHand: current.onHand + balance.onHand,
        reserved: current.reserved + balance.reserved,
      });
    }
    return [...totals].map(([productId, balance]) => ({ productId, ...balance }));
  }

  @Transactional()
  async reservations(productIds?: readonly string[]) {
    return this.stock.reservations(productIds);
  }

  // --- internals -------------------------------------------------------------------------------

  /**
   * Applies entries atomically: claims the idempotency key, locks every touched balance in a fixed
   * order, updates balances and appends the movements with their resulting balance.
   */
  private async post(operation: {
    kind: string;
    key?: string | undefined;
    reference: Reference | null;
    note: string | null;
    entries: readonly Entry[];
  }): Promise<OperationResult> {
    const operationId = randomUUID();
    if (
      operation.key &&
      !(await this.stock.claimOperation(operation.key, operationId, operation.kind))
    ) {
      return { operationId, applied: false };
    }
    const actor = this.currentActor.require();
    const balances = await this.stock.lockBalances(operation.entries);
    const movements: NewMovement[] = [];
    for (const entry of operation.entries) {
      const key = balanceKey(entry);
      const current = balances.get(key) ?? { onHand: 0n, reserved: 0n };
      const next = {
        onHand: current.onHand + entry.delta,
        reserved: current.reserved + (entry.reservedDelta ?? 0n),
      };
      balances.set(key, next);
      if (entry.type && entry.delta !== 0n) {
        movements.push({
          operationId,
          warehouseId: entry.warehouseId,
          productId: entry.productId,
          type: entry.type,
          quantity: entry.delta,
          balanceAfter: next.onHand,
          reference: operation.reference,
          note: operation.note,
          actor: { id: actor.id, name: actor.displayName },
        });
      }
    }
    for (const entry of operation.entries) {
      await this.stock.saveBalance(
        entry,
        balances.get(balanceKey(entry)) ?? { onHand: 0n, reserved: 0n },
      );
    }
    await this.stock.insertMovements(movements);
    return { operationId, applied: true };
  }

  private async applyReserved(entries: readonly Entry[]): Promise<void> {
    await this.post({ kind: 'RESERVATION', reference: null, note: null, entries });
  }

  private async resolve(
    lines: readonly QuantityInput[],
  ): Promise<{ product: ProductSummary; quantity: Quantity }[]> {
    if (lines.length === 0) {
      throw new ValidationError(
        'inventory.no_lines',
        'La operación debe tener al menos una línea.',
      );
    }
    const products = new Map(
      (await this.catalog.findByIds(lines.map((line) => line.productId))).map((p) => [p.id, p]),
    );
    return lines.map((line) => {
      const product = products.get(line.productId);
      if (!product)
        throw new NotFoundError('inventory.unknown_product', 'Uno de los productos no existe.');
      if (!product.active) {
        throw new ValidationError(
          'inventory.inactive_product',
          `El producto ${product.code} está desactivado.`,
        );
      }
      const quantity = Quantity.parse(line.quantity, line.unit ?? product.stockUnit);
      if (quantity.dimension !== unit(product.stockUnit).dimension) {
        throw new ValidationError(
          'inventory.incompatible_unit',
          `La unidad no es compatible con ${product.code} (${product.stockUnit}).`,
        );
      }
      return { product, quantity };
    });
  }

  private warehouse(warehouses: readonly Warehouse[], code: string): Warehouse {
    const warehouse = warehouses.find((w) => w.code === code.trim().toUpperCase());
    if (!warehouse)
      throw new NotFoundError('inventory.unknown_warehouse', `No existe la bodega ${code}.`);
    return warehouse;
  }
}

function mergeLines(lines: readonly StockLine[]): StockLine[] {
  const totals = new Map<string, bigint>();
  for (const line of lines) {
    if (line.quantity <= 0n) continue;
    totals.set(line.productId, (totals.get(line.productId) ?? 0n) + line.quantity);
  }
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }));
}

function matches(product: ProductSummary, search: string | undefined): boolean {
  if (!search) return true;
  const term = search.toLowerCase();
  return product.code.toLowerCase().includes(term) || product.name.toLowerCase().includes(term);
}
