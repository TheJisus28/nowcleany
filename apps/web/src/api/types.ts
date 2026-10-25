// Shapes of the API responses (see the views in apps/api). Quantities are exact decimal strings.

export interface Q {
  quantity: string;
  unit: string;
}

export interface Ref {
  id: string;
  code: string;
  name: string;
}

export type ProductType = 'RAW_MATERIAL' | 'BULK' | 'FINISHED_GOOD';
export type CoverageStatus = 'COVERED' | 'NEEDS_PRODUCTION' | 'SHORT';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  lastLoginAt: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: Profile;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  type: ProductType;
  typeLabel: string;
  stockUnit: string;
  batchCapacity: Q | null;
  active: boolean;
  activeFormulaVersion: number | null;
  hasDraftFormula: boolean;
}

export interface FormulaLine {
  componentId: string;
  componentCode: string;
  componentName: string;
  componentType: ProductType;
  componentTypeLabel: string;
  quantity: Q;
  wasteBps: number;
}

export interface Formula {
  id: string;
  productId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  batchYield: Q;
  notes: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  publishedBy: { id: string; name: string } | null;
  publishedAt: string | null;
  retiredAt: string | null;
  lines: FormulaLine[];
}

export interface RequirementLine {
  productId: string;
  code: string;
  name: string;
  type: ProductType;
  typeLabel: string;
  quantity: Q;
}

export interface Requirements {
  product: { id: string; code: string; name: string };
  quantity: Q;
  formulaVersion: number;
  components: RequirementLine[];
  rawMaterials?: RequirementLine[];
}

export interface StockStatus {
  productId: string;
  code: string;
  name: string;
  type: ProductType;
  typeLabel: string;
  unit: string;
  onHand: Q;
  reserved: Q;
  available: Q;
  negativeOnHand: boolean;
  oversold: boolean;
  byWarehouse: { warehouseCode: string; warehouseName: string; onHand: Q }[];
}

export interface Movement {
  id: string;
  occurredAt: string;
  type: string;
  typeLabel: string;
  warehouse: { code: string; name: string };
  product: { id: string; code: string; name: string };
  quantity: Q;
  balanceAfter: Q;
  reference: { type: string; id: string; label: string } | null;
  note: string | null;
  actor: { id: string; name: string };
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  city: string | null;
  active: boolean;
}

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'CANCELLED';

export interface SalesOrder {
  id: string;
  number: string;
  label: string;
  status: OrderStatus;
  statusLabel: string;
  customer: { id: string; name: string; taxId: string | null };
  seller: { id: string; name: string };
  estimatedDeliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  lines: { productId: string; productCode: string; productName: string; quantity: Q }[];
}

export interface Material {
  productId: string;
  code: string;
  name: string;
  typeLabel: string;
  required: Q;
  onHand: Q;
  shortage: Q;
}

export interface ProductionOrder {
  id: string;
  label: string;
  kind: string;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  statusLabel: string;
  product: { id: string; code: string; name: string; type: 'BULK' | 'FINISHED_GOOD' };
  plannedQuantity: Q;
  producedQuantity: Q | null;
  batches: number | null;
  batchCapacity: Q | null;
  scheduledDate: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  materials?: Material[];
}

export interface PurchaseOrder {
  id: string;
  label: string;
  supplier: string;
  expectedDate: string | null;
  status: 'OPEN' | 'RECEIVED' | 'CANCELLED';
  statusLabel: string;
  notes: string | null;
  receiptDocument: string | null;
  createdBy: string;
  createdAt: string;
  receivedAt: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  lines: {
    productId: string;
    productCode: string;
    productName: string;
    quantity: Q;
    receivedQuantity: Q | null;
  }[];
}

export interface PlanningSummary {
  generatedAt: string;
  confirmedOrders: number;
  draftOrders: number;
  ordersByCoverage: Record<CoverageStatus, number>;
  oversoldProducts: number;
  productsToPack: number;
  bulksToProduce: number;
  materialsToBuy: number;
  plannedProductionOrders: number;
  purchaseOrdersInTransit: number;
  missingFormulas: Ref[];
}

export interface OversellRow {
  product: Ref;
  sold: Q;
  potential: Q;
  bySeller: { sellerId: string; sellerName: string; orders: number; quantity: Q }[];
  onHand: Q;
  producible: Q;
  capacity: Q;
  uncovered: Q;
  limitingMaterial: Ref | null;
  materialsToCover: (Ref & { typeLabel: string; quantity: Q })[];
}

export interface CoverageLine {
  product: Ref;
  quantity: Q;
  fromStock: Q;
  fromProduction: Q;
  uncovered: Q;
  status: CoverageStatus;
  statusLabel: string;
}

export interface OrderCoverage {
  orderId: string;
  label: string;
  customerId: string;
  customerName: string;
  seller: { id: string; name: string };
  estimatedDeliveryDate: string | null;
  confirmedAt: string | null;
  priority: number;
  status: CoverageStatus;
  statusLabel: string;
  lines: CoverageLine[];
}

export interface PackagingNeed {
  product: Ref;
  demand: Q;
  onHand: Q;
  toPack: Q;
  planned: Q;
  pendingToSchedule: Q;
  canMakeNow: Q;
  limitingMaterial: Ref | null;
  orders: {
    orderId: string;
    label: string;
    customerId: string;
    customerName: string;
    sellerName: string;
    estimatedDeliveryDate: string | null;
    quantity: Q;
    toProduce: Q;
  }[];
}

export interface BulkNeed {
  product: Ref;
  required: Q;
  onHand: Q;
  toProduce: Q;
  planned: Q;
  pendingToSchedule: Q;
  batchCapacity: Q | null;
  batchesPending: number | null;
  canMakeNow: Q;
  limitingMaterial: Ref | null;
  usedBy: Ref[];
}

export interface PurchaseNeed {
  product: Ref;
  required: Q;
  onHand: Q;
  onOrder: Q;
  toBuy: Q;
  usedBy: Ref[];
  inTransit: {
    orderId: string;
    label: string;
    supplier: string;
    expectedDate: string | null;
    quantity: Q;
  }[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  lastLoginAt: string | null;
  roles: string[];
}

export interface Role {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface AvailabilityRow {
  product: Ref;
  onHand: Q;
  committed: Q;
  producible: Q;
  promisable: Q;
  limitingMaterial: Ref | null;
}

export interface WhereUsed extends Ref {
  type: ProductType;
  typeLabel: string;
}
