import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/toast';
import { api, errorMessage } from './client';
import type {
  BulkNeed,
  Customer,
  Formula,
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
  StockStatus,
  User,
  Warehouse,
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

// --- catalog --------------------------------------------------------------------------------

export const useProducts = (
  filter: { type?: string | undefined; q?: string | undefined; active?: boolean | undefined } = {},
) =>
  useQuery({
    queryKey: ['products', filter],
    queryFn: () => api.get<Product[]>(`/v1/products${query(filter)}`),
  });

export const useActiveFormula = (productId: string | undefined) =>
  useQuery({
    queryKey: ['formula', productId],
    queryFn: () => api.get<Formula>(`/v1/products/${productId ?? ''}/active-formula`),
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
  filter: { status?: string | undefined; mine?: boolean | undefined; q?: string | undefined } = {},
) =>
  useQuery({
    queryKey: ['orders', filter],
    queryFn: () => api.get<SalesOrder[]>(`/v1/sales-orders${query(filter)}`),
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<SalesOrder>(`/v1/sales-orders/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const useCustomers = (q?: string) =>
  useQuery({
    queryKey: ['customers', q],
    queryFn: () => api.get<Customer[]>(`/v1/customers${query({ q })}`),
  });

// --- production & purchasing ------------------------------------------------------------------

export const useProductionOrders = (status?: string) =>
  useQuery({
    queryKey: ['production-orders', status],
    queryFn: () => api.get<ProductionOrder[]>(`/v1/production-orders${query({ status })}`),
  });

export const useProductionOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['production-order', id],
    queryFn: () => api.get<ProductionOrder>(`/v1/production-orders/${id ?? ''}`),
    enabled: Boolean(id),
  });

export const usePurchaseOrders = (status?: string) =>
  useQuery({
    queryKey: ['purchase-orders', status],
    queryFn: () => api.get<PurchaseOrder[]>(`/v1/purchase-orders${query({ status })}`),
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
