import { type QuantityDto, toQuantityDto } from '../../../shared-kernel/index.js';
import type { ProductSummary } from '../../product/index.js';
import { PRODUCT_TYPE_LABELS } from '../../product/index.js';
import { available, MOVEMENT_LABELS, type MovementType } from '../domain/stock.js';
import type { BalanceRecord, MovementRecord, Warehouse } from './stock.repository.js';

export interface StockStatusView {
  readonly productId: string;
  readonly code: string;
  readonly name: string;
  readonly type: ProductSummary['type'];
  readonly typeLabel: string;
  readonly unit: ProductSummary['stockUnit'];
  readonly onHand: QuantityDto;
  readonly reserved: QuantityDto;
  readonly available: QuantityDto;
  /** Physical stock below zero (movements recorded before their counterpart). */
  readonly negativeOnHand: boolean;
  /** More committed than in stock: oversold. */
  readonly oversold: boolean;
  readonly byWarehouse: readonly {
    warehouseCode: string;
    warehouseName: string;
    onHand: QuantityDto;
  }[];
}

export interface MovementView {
  readonly id: string;
  readonly occurredAt: string;
  readonly type: MovementType;
  readonly typeLabel: string;
  readonly warehouse: { code: string; name: string };
  readonly product: { id: string; code: string; name: string };
  readonly quantity: QuantityDto;
  readonly balanceAfter: QuantityDto;
  readonly reference: { type: string; id: string; label: string } | null;
  readonly note: string | null;
  readonly actor: { id: string; name: string };
}

export function toStatusView(
  product: ProductSummary,
  balances: readonly BalanceRecord[],
  warehouses: readonly Warehouse[],
): StockStatusView {
  const onHand = balances.reduce((sum, balance) => sum + balance.onHand, 0n);
  const reserved = balances.reduce((sum, balance) => sum + balance.reserved, 0n);
  const free = available({ onHand, reserved });
  return {
    productId: product.id,
    code: product.code,
    name: product.name,
    type: product.type,
    typeLabel: PRODUCT_TYPE_LABELS[product.type],
    unit: product.stockUnit,
    onHand: toQuantityDto(onHand, product.stockUnit),
    reserved: toQuantityDto(reserved, product.stockUnit),
    available: toQuantityDto(free, product.stockUnit),
    negativeOnHand: onHand < 0n,
    oversold: free < 0n,
    byWarehouse: warehouses.map((warehouse) => ({
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      onHand: toQuantityDto(
        balances.find((balance) => balance.warehouseId === warehouse.id)?.onHand ?? 0n,
        product.stockUnit,
      ),
    })),
  };
}

export function toMovementView(
  movement: MovementRecord,
  product: ProductSummary | undefined,
  warehouse: Warehouse | undefined,
): MovementView {
  const unit = product?.stockUnit ?? 'un';
  return {
    id: movement.id.toString(),
    occurredAt: movement.occurredAt.toISOString(),
    type: movement.type,
    typeLabel: MOVEMENT_LABELS[movement.type],
    warehouse: { code: warehouse?.code ?? '?', name: warehouse?.name ?? 'Bodega desconocida' },
    product: {
      id: movement.productId,
      code: product?.code ?? '?',
      name: product?.name ?? 'Producto desconocido',
    },
    quantity: toQuantityDto(movement.quantity, unit),
    balanceAfter: toQuantityDto(movement.balanceAfter, unit),
    reference: movement.reference,
    note: movement.note,
    actor: movement.actor,
  };
}

export interface WarehouseView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}
