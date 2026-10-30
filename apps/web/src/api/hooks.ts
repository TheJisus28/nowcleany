import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/toast';
import { api, errorMessage } from './client';
import type {
  AvailabilityRow,
  BulkNeed,
  Customer,
  FinanceSummary,
  Invoice,
  Formula,
  MapConfig,
  MonthlyPurchase,
  Movement,
  OrderCoverage,
  OversellRow,
  PackagingNeed,
  PlanningSummary,
  Product,
  ProductionOrder,
  PurchaseNeed,
  PurchaseOrder,
  Role,
  SalesOrder,
  Shipment,
  Seller,
  StockAllocationRow,
  StockStatus,
  Supplier,
  SupplierInvoice,
  TrailEntry,
  User,
  Visit,
  Warehouse,
  WhereUsed,
} from './types';

const query = (params: Record<string, string | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

// --- planning ------------------------------------------------------------------------------

export const useSummary = () =>
  useQuery({
    queryKey: ['planning', 'summary'],
    queryFn: () => api.get<PlanningSummary>('/v1/planning/summary'),
  });

export const useOversell = () =>
  useQuery({
    queryKey: ['planning', 'oversell'],
    queryFn: () => api.get<{ generatedAt: string; rows: OversellRow[] }>('/v1/planning/oversell'),
  });

export const useOrderCoverage = (enabled = true) =>
  useQuery({
    queryKey: ['planning', 'coverage'],
    queryFn: () => api.get<OrderCoverage[]>('/v1/planning/order-coverage'),
    enabled,
  });

export const useProductionNeeds = () =>
  useQuery({
    queryKey: ['planning', 'production'],
    queryFn: () =>
      api.get<{ generatedAt: string; packaging: PackagingNeed[]; bulk: BulkNeed[] }>(
        '/v1/planning/production-needs',
      ),
  });

export const usePurchaseNeeds = () =>
  useQuery({
    queryKey: ['planning', 'purchase'],
    queryFn: () =>
      api.get<{ generatedAt: string; rows: PurchaseNeed[] }>('/v1/planning/purchase-needs'),
  });

export const useAvailability = () =>
  useQuery({
    queryKey: ['planning', 'availability'],
    queryFn: () =>
      api.get<{ generatedAt: string; rows: AvailabilityRow[] }>('/v1/planning/availability'),
  });

export const useStockAllocation = () =>
  useQuery({
    queryKey: ['planning', 'stock-allocation'],
    queryFn: () =>
      api.get<{ generatedAt: string; rows: StockAllocationRow[] }>('/v1/planning/stock-allocation'),
  });

// --- catalog --------------------------------------------------------------------------------

export const useProducts = (
  filter: { type?: string | undefined; q?: string | undefined; active?: boolean | undefined } = {},
) =>
  useQuery({
    queryKey: ['products', filter],
    queryFn: () => api.get<Product[]>(`/v1/products${query(filter)}`),
  });

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<Product>(`/v1/products/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const useWhereUsed = (id: string | undefined) =>
  useQuery({
    queryKey: ['where-used', id],
    queryFn: () => api.get<WhereUsed[]>(`/v1/products/${id ?? ''}/where-used`),
    enabled: Boolean(id),
  });

export const useActiveFormula = (productId: string | undefined) =>
  useQuery({
    queryKey: ['formula', productId],
    queryFn: () => api.get<Formula>(`/v1/products/${productId ?? ''}/active-formula`),
    enabled: Boolean(productId),
    retry: false,
  });

export const useDraftFormula = (productId: string | undefined) =>
  useQuery({
    queryKey: ['draft-formula', productId],
    queryFn: () => api.get<Formula>(`/v1/products/${productId ?? ''}/draft-formula`),
    enabled: Boolean(productId),
    retry: false,
  });

export const useFormulaHistory = (productId: string | undefined) =>
  useQuery({
    queryKey: ['formulas', productId],
    queryFn: () => api.get<Formula[]>(`/v1/products/${productId ?? ''}/formulas`),
    enabled: Boolean(productId),
  });

// --- inventory ------------------------------------------------------------------------------

export const useStockStatus = (
  filter: { type?: string | undefined; q?: string | undefined } = {},
) =>
  useQuery({
    queryKey: ['inventory', 'status', filter],
    queryFn: () => api.get<StockStatus[]>(`/v1/inventory/status${query(filter)}`),
  });

export const useMovements = (filter: {
  productId?: string | undefined;
  warehouse?: string | undefined;
  type?: string | undefined;
}) =>
  useQuery({
    queryKey: ['inventory', 'movements', filter],
    queryFn: () =>
      api.get<Movement[]>(`/v1/inventory/movements${query({ ...filter, limit: '100' })}`),
  });

export const useWarehouses = () =>
  useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/v1/inventory/warehouses'),
  });

// --- sales ----------------------------------------------------------------------------------

export const useOrders = (
  filter: {
    status?: string | undefined;
    mine?: boolean | undefined;
    q?: string | undefined;
    customerId?: string | undefined;
    productId?: string | undefined;
    limit?: string | undefined;
  } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: ['orders', filter],
    queryFn: () => api.get<SalesOrder[]>(`/v1/sales-orders${query(filter)}`),
    enabled,
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<SalesOrder>(`/v1/sales-orders/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<Customer>(`/v1/customers/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const useCustomers = (
  filter: { q?: string | undefined; sellerId?: string | undefined } = {},
) =>
  useQuery({
    queryKey: ['customers', filter],
    queryFn: () => api.get<Customer[]>(`/v1/customers${query(filter)}`),
  });

export const useSellers = (enabled = true) =>
  useQuery({
    queryKey: ['sellers'],
    queryFn: () => api.get<Seller[]>('/v1/sellers'),
    enabled,
    staleTime: 5 * 60_000,
  });

export const useVisits = (
  filter: {
    sellerId?: string | undefined;
    customerId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
  enabled = true,
) =>
  useQuery({
    queryKey: ['visits', filter],
    queryFn: () => api.get<Visit[]>(`/v1/visits${query(filter)}`),
    enabled,
  });

// --- maps -----------------------------------------------------------------------------------

export const useMapConfig = () =>
  useQuery({
    queryKey: ['map-config'],
    queryFn: () => api.get<MapConfig>('/v1/maps/config'),
    staleTime: Infinity,
  });

// --- production & purchasing ------------------------------------------------------------------

export const useProductionOrders = (status?: string, productId?: string) =>
  useQuery({
    queryKey: ['production-orders', status, productId],
    queryFn: () =>
      api.get<ProductionOrder[]>(`/v1/production-orders${query({ status, productId })}`),
  });

export const useProductionOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['production-order', id],
    queryFn: () => api.get<ProductionOrder>(`/v1/production-orders/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const usePurchaseOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get<PurchaseOrder>(`/v1/purchase-orders/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const usePurchaseOrders = (status?: string, productId?: string, enabled = true) =>
  useQuery({
    queryKey: ['purchase-orders', status, productId],
    queryFn: () => api.get<PurchaseOrder[]>(`/v1/purchase-orders${query({ status, productId })}`),
    enabled,
  });

export const useSuppliers = (q?: string, enabled = true) =>
  useQuery({
    queryKey: ['suppliers', q],
    queryFn: () => api.get<Supplier[]>(`/v1/suppliers${query({ q })}`),
    enabled,
  });

export const useSupplierInvoices = (
  filter: {
    purchaseOrderId?: string | undefined;
    supplierId?: string | undefined;
    open?: boolean;
  } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: ['supplier-invoices', filter],
    queryFn: () => api.get<SupplierInvoice[]>(`/v1/supplier-invoices${query(filter)}`),
    enabled,
  });

export const useSupplierInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: ['supplier-invoice', id],
    queryFn: () => api.get<SupplierInvoice>(`/v1/supplier-invoices/${id ?? ''}`),
    enabled: Boolean(id),
  });

/** Purchasing's month (?month=2026-11; the month being planned by default). */
export const useMonthlyPurchase = (month?: string) =>
  useQuery({
    queryKey: ['monthly-purchase', month],
    queryFn: () => api.get<MonthlyPurchase>(`/v1/planning/monthly-purchase${query({ month })}`),
  });

// --- billing, logistics, audit ------------------------------------------------------------------

export const useInvoices = (
  filter: {
    q?: string | undefined;
    customerId?: string | undefined;
    open?: boolean;
    limit?: string;
  } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: ['invoices', filter],
    queryFn: () => api.get<Invoice[]>(`/v1/invoices${query(filter)}`),
    enabled,
  });

export const useInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/v1/invoices/${id ?? ''}`),
    enabled: Boolean(id),
  });

/** The invoice of an order, if it was invoiced (empty list otherwise). */
export const useOrderInvoice = (orderId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['invoices', 'order', orderId],
    queryFn: () => api.get<Invoice[]>(`/v1/invoices${query({ orderId })}`),
    enabled: Boolean(orderId) && enabled,
  });

export const useShipments = (
  filter: { status?: string | undefined; orderId?: string | undefined } = {},
  enabled = true,
) =>
  useQuery({
    queryKey: ['shipments', filter],
    queryFn: () => api.get<Shipment[]>(`/v1/shipments${query(filter)}`),
    enabled,
  });

export const useShipment = (id: string | undefined) =>
  useQuery({
    queryKey: ['shipment', id],
    queryFn: () => api.get<Shipment>(`/v1/shipments/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const useFinance = (period: { from?: string | undefined; to?: string | undefined } = {}) =>
  useQuery({
    queryKey: ['finance', period],
    queryFn: () => api.get<FinanceSummary>(`/v1/finance/summary${query(period)}`),
  });

export const useTrail = (filter: {
  entityType?: string | undefined;
  q?: string | undefined;
  from?: string | undefined;
}) =>
  useQuery({
    queryKey: ['trail', filter],
    queryFn: () => api.get<TrailEntry[]>(`/v1/trail${query(filter)}`),
  });

/** An order's timeline: who did and authorized each step. */
export const useOrderHistory = (orderId: string | undefined) =>
  useQuery({
    queryKey: ['order-history', orderId],
    queryFn: () => api.get<TrailEntry[]>(`/v1/sales-orders/${orderId ?? ''}/history`),
    enabled: Boolean(orderId),
  });

// --- identity -------------------------------------------------------------------------------

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/v1/users') });

export const useRoles = () =>
  useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/v1/roles') });

/**
 * A write operation. On success every cached view is refreshed: one sale changes stock, coverage,
 * plant and purchasing needs at once, and the data is small.
 */
export function useAction<TInput, TResult>(
  action: (input: TInput) => Promise<TResult>,
  options: { success?: string | ((result: TResult) => string) } = {},
) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: action,
    onSuccess: async (result) => {
      await client.invalidateQueries();
      const message =
        typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.show({ tone: 'success', message });
    },
    onError: (error) => {
      toast.show({ tone: 'error', message: errorMessage(error) });
    },
  });
}
