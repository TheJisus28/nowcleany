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

export type ProductType = 'RAW_MATERIAL' | 'BULK' | 'FINISHED_GOOD' | 'RESALE';
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
  /** Pesos per stock unit, integer strings. */
  price: string | null;
  cost: string | null;
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
  /** Confirmed pre-sales not dispatched yet (informative: stock does not move until dispatch). */
  committed: Q;
  /** onHand − committed. */
  projected: Q;
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

export type DocumentType = 'NIT' | 'CC';

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  isMain: boolean;
  active: boolean;
}

export interface Customer {
  id: string;
  documentType: DocumentType;
  documentTypeLabel: string;
  documentNumber: string;
  name: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  active: boolean;
  seller: { id: string; name: string } | null;
  branches: Branch[];
}

export interface Seller {
  id: string;
  name: string;
}

export interface Visit {
  id: string;
  seller: { id: string; name: string };
  customer: { id: string; name: string };
  branch: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  visitedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  distanceM: number | null;
  /** null when the branch has no location yet. */
  onSite: boolean | null;
  onSiteRadiusM: number;
  notes: string | null;
  order: { id: string; label: string } | null;
}

export interface Supplier {
  id: string;
  documentNumber: string | null;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  active: boolean;
}

export interface MapConfig {
  token: string | null;
  center: { latitude: number; longitude: number };
}

export interface Place {
  label: string;
  latitude: number;
  longitude: number;
}

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'INVOICED'
  | 'READY'
  | 'PARTIAL'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface SalesOrder {
  id: string;
  number: string;
  label: string;
  status: OrderStatus;
  statusLabel: string;
  /** Who must act next; null when the flow ended. */
  nextStep: string | null;
  priority: number | null;
  allowPartial: boolean;
  customer: { id: string; name: string; documentType: DocumentType; documentNumber: string };
  branch: { id: string; name: string; address: string | null; city: string | null };
  seller: { id: string; name: string };
  estimatedDeliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  invoicedAt: string | null;
  invoicedBy: string | null;
  readyAt: string | null;
  readyBy: string | null;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  lines: {
    productId: string;
    productCode: string;
    productName: string;
    quantity: Q;
    /** Handed over by plant, waiting for a guide. */
    ready: Q;
    dispatched: Q;
    /** Still to ship. */
    pending: Q;
  }[];
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

export type PurchaseStatus = 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

export interface PurchaseOrder {
  id: string;
  label: string;
  supplier: { id: string; name: string };
  expectedDate: string | null;
  status: PurchaseStatus;
  statusLabel: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  receivedAt: string | null;
  cancelledAt: string | null;
  /** Pesos before VAT. */
  total: string;
  lines: {
    productId: string;
    productCode: string;
    productName: string;
    quantity: Q;
    received: Q;
    pending: Q;
    unitCost: string;
    amount: string;
  }[];
}

export interface SupplierInvoice {
  id: string;
  purchaseOrder: { id: string; label: string };
  supplier: { id: string; name: string };
  documentNumber: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  tax: string;
  total: string;
  paid: string;
  balance: string;
  overdue: boolean;
  receivedBy: string;
  createdAt: string;
  lines: {
    productId: string;
    productCode: string;
    productName: string;
    quantity: Q;
    unitCost: string;
    amount: string;
  }[];
  payments?: {
    id: string;
    amount: string;
    paidOn: string;
    methodLabel: string;
    reference: string | null;
    recordedBy: string;
  }[];
}

export type CollectionStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';
export type PaymentMethod = 'TRANSFER' | 'CASH' | 'DEPOSIT' | 'CHECK';

export interface Invoice {
  id: string;
  label: string;
  order: { id: string; label: string };
  customer: { id: string; name: string; document: string };
  branchName: string;
  seller: { id: string; name: string };
  issuedAt: string;
  issuedBy: string;
  dueDate: string;
  subtotal: string;
  tax: string;
  total: string;
  paid: string;
  balance: string;
  status: CollectionStatus;
  statusLabel: string;
  aging: string | null;
  agingLabel: string | null;
  /** Something was invoiced before it existed (to make or to buy). */
  hasPending: boolean;
  lines: {
    productId: string;
    productCode: string;
    productName: string;
    quantity: Q;
    unitPrice: string;
    amount: string;
    fromStock: Q;
    pending: Q;
  }[];
  payments?: {
    id: string;
    amount: string;
    paidOn: string;
    method: PaymentMethod;
    methodLabel: string;
    reference: string | null;
    recordedBy: string;
  }[];
}

export type ShipmentStatus = 'PLANNED' | 'IN_TRANSIT' | 'DELIVERED';

export interface Shipment {
  id: string;
  label: string;
  carrier: string;
  vehiclePlate: string;
  driverName: string;
  route: string | null;
  scheduledDate: string;
  status: ShipmentStatus;
  statusLabel: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  dispatchedAt: string | null;
  dispatchedBy: string | null;
  deliveredAt: string | null;
  orders: {
    orderId: string;
    orderLabel: string;
    customer: { id: string; name: string };
    branch: { name: string; address: string | null; city: string | null };
    /** The guide carries only part of the order. */
    partial: boolean;
    deliveredAt: string | null;
    receivedBy: string | null;
    lines: { productId: string; productCode: string; productName: string; quantity: Q }[];
  }[];
}

export interface MonthlyPurchase {
  month: string;
  basedOn: string;
  products: {
    product: Ref;
    type: ProductType;
    typeLabel: string;
    lastMonth: Q;
    average3: Q;
    plan: Q;
    planSetBy: string | null;
  }[];
  purchases: {
    product: Ref;
    type: ProductType;
    typeLabel: string;
    monthNeed: Q;
    onHand: Q;
    onOrder: Q;
    urgent: Q;
    suggested: Q;
    unitCost: string | null;
    estimatedCost: string;
    usedBy: Ref[];
  }[];
  estimatedCost: string;
}

export interface AgingReport {
  total: string;
  overdue: string;
  buckets: { bucket: string; label: string; amount: string; documents: number }[];
  parties: { id: string; name: string; balance: string; overdue: string; documents: number }[];
}

export interface FinanceSummary {
  generatedAt: string;
  period: { from: string; to: string };
  receivables: AgingReport;
  payables: AgingReport;
  movements: {
    date: string;
    direction: 'IN' | 'OUT';
    party: string;
    document: string;
    method: string;
    reference: string | null;
    amount: string;
    recordedBy: string;
  }[];
  totals: { collected: string; paid: string; net: string };
  months: { month: string; invoiced: string; collected: string; bought: string; paid: string }[];
}

export interface TrailEntry {
  id: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string;
  label: string;
  action: string;
  summary: string;
  actor: { id: string; name: string; role: string | null };
  occurredAt: string;
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

export interface StockAllocationRow {
  product: Ref;
  type: ProductType;
  typeLabel: string;
  onHand: Q;
  forProduction: Q;
  forOrders: Q;
  idle: Q;
  missing: Q;
  incoming: Q;
}
