import { CircleDashed, ClipboardList, Factory, Plus, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAvailability, useOrderCoverage, useOrders } from '../../api/hooks';
import type { AvailabilityRow, OrderCoverage, SalesOrder } from '../../api/types';
import { useProfile, useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, CoverageChip, DueDate } from '../../components/status';
import { EmptyState, Input, PageHeader, Panel, QueryView } from '../../components/ui';
import { daysUntil, formatDecimal, isZero, plural, unitLabel } from '../../lib/format';

/** A seller's day: their orders and whether they will make it, and what they can still promise. */
export function SalesHomePage() {
  const profile = useProfile();
  const { can } = useSession();
  const coverage = useOrderCoverage();
  const drafts = useOrders({ mine: true, status: 'DRAFT' });
  const mine = useMemo(
    () => (coverage.data ?? []).filter((row) => row.seller.id === profile.id),
    [coverage.data, profile.id],
  );
  const firstName = profile.fullName.split(' ')[0] ?? profile.fullName;

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Tus preventas por entregar, si se van a poder cumplir y cuánto puedes prometer hoy."
        actions={
          can('sales-orders:write') ? (
            <Link
              to="/ventas/nueva"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
            >
              <Plus aria-hidden className="size-4" />
              Nueva preventa
            </Link>
          ) : null
        }
      />

      <QueryView query={coverage}>
        {() => <SellerKpis rows={mine} drafts={drafts.data} />}
      </QueryView>

      <div className="flex flex-col gap-6">
        <Panel
          title="Mis entregas"
          description="Enviadas al consolidado, en el orden en que se atienden: primero la prioridad del consolidado y la entrega más cercana."
          actions={
            <Link to="/ventas" className="text-sm font-medium text-brand hover:underline">
              Ver todas mis preventas
            </Link>
          }
          flush
        >
          <QueryView query={coverage}>{() => <DeliveriesTable rows={mine} />}</QueryView>
        </Panel>

        {drafts.data && drafts.data.length > 0 ? (
          <Panel
            title="Borradores por enviar"
            description="No comprometen producto ni cuentan para planta y compras hasta que los envíes al consolidado."
            flush
          >
            <DraftsTable rows={drafts.data} />
          </Panel>
        ) : null}

        <Promisable />
      </div>
    </>
  );
}

function SellerKpis({ rows, drafts }: { rows: OrderCoverage[]; drafts: SalesOrder[] | undefined }) {
  const late = rows.filter((row) => (daysUntil(row.estimatedDeliveryDate) ?? 1) < 0).length;
  const thisWeek = rows.filter((row) => {
    const days = daysUntil(row.estimatedDeliveryDate);
    return days !== null && days >= 0 && days <= 7;
  }).length;
  const short = rows.filter((row) => row.status === 'SHORT').length;
  const production = rows.filter((row) => row.status === 'NEEDS_PRODUCTION').length;
  return (
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Por entregar"
        value={rows.length}
        icon={ClipboardList}
        tone={late > 0 ? 'critical' : 'brand'}
        hint={
          late > 0
            ? `${plural(late, 'atrasada', 'atrasadas')} · ${String(thisWeek)} esta semana`
            : `${String(thisWeek)} esta semana`
        }
      />
      <Kpi
        label="Con faltante de insumos"
        value={short}
        icon={TriangleAlert}
        tone={short > 0 ? 'critical' : 'good'}
        hint={short > 0 ? 'Compras ya ve qué falta para cumplirlas' : 'Todas se pueden fabricar'}
      />
      <Kpi
        label="Requieren producción"
        value={production}
        icon={Factory}
        tone={production > 0 ? 'warning' : 'good'}
        hint="Planta ya las tiene en su lista"
      />
      <Kpi
        label="Borradores"
        value={drafts?.length ?? '—'}
        icon={CircleDashed}
        tone="neutral"
        hint="No cuentan hasta que los envíes"
      />
    </div>
  );
}

function DeliveriesTable({ rows }: { rows: OrderCoverage[] }) {
  return (
    <DataTable<OrderCoverage>
      label="Mis entregas"
      rows={rows}
      rowKey={(row) => row.orderId}
      rowClassName={(row) => (row.status === 'SHORT' ? 'bg-critical-soft/35' : undefined)}
      empty={
        <EmptyState
          icon={<ClipboardList />}
          title="No tienes preventas enviadas por entregar"
          description="Cuando envíes una preventa al consolidado, aquí verás si se puede cumplir a tiempo."
        />
      }
      columns={[
        {
          key: 'order',
          header: 'Preventa',
          render: (row) => (
            <EntityLink to="order" id={row.orderId} className="font-medium">
              {row.label}
            </EntityLink>
          ),
        },
        {
          key: 'customer',
          header: 'Cliente',
          render: (row) => (
            <EntityLink to="customer" id={row.customerId}>
              {row.customerName}
            </EntityLink>
          ),
        },
        {
          key: 'delivery',
          header: 'Entrega',
          render: (row) => <DueDate date={row.estimatedDeliveryDate} />,
        },
        {
          key: 'products',
          header: 'Productos',
          hideOnMobile: true,
          render: (row) => (
            <span className="text-ink-2">
              {row.lines
                .map(
                  (line) =>
                    `${line.product.code} × ${formatDecimal(line.quantity.quantity)} ${unitLabel(line.quantity.unit)}`,
                )
                .join(', ')}
            </span>
          ),
        },
        {
          key: 'coverage',
          header: 'Cobertura',
          render: (row) => <CoverageChip status={row.status} />,
        },
      ]}
    />
  );
}

function DraftsTable({ rows }: { rows: SalesOrder[] }) {
  return (
    <DataTable<SalesOrder>
      label="Borradores"
      rows={rows}
      rowKey={(row) => row.id}
      columns={[
        {
          key: 'order',
          header: 'Preventa',
          render: (row) => (
            <EntityLink to="order" id={row.id} className="font-medium">
              {row.label}
            </EntityLink>
          ),
        },
        {
          key: 'customer',
          header: 'Cliente',
          render: (row) => (
            <EntityLink to="customer" id={row.customer.id}>
              {row.customer.name}
            </EntityLink>
          ),
        },
        {
          key: 'delivery',
          header: 'Entrega',
          render: (row) => <DueDate date={row.estimatedDeliveryDate} lateLabel="Fecha vencida" />,
        },
        {
          key: 'products',
          header: 'Productos',
          hideOnMobile: true,
          render: (row) => (
            <span className="text-ink-2">
              {row.lines
                .map(
                  (line) =>
                    `${line.productCode} × ${formatDecimal(line.quantity.quantity)} ${unitLabel(line.quantity.unit)}`,
                )
                .join(', ')}
            </span>
          ),
        },
      ]}
    />
  );
}

function Promisable() {
  const availability = useAvailability();
  const [search, setSearch] = useState('');
  return (
    <Panel
      title="¿Cuánto puedo prometer?"
      description="Lo que hay en bodega más lo que se puede fabricar con los insumos de hoy, menos lo ya comprometido."
      actions={
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Buscar producto</span>
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Código o nombre"
            className="pl-9"
          />
        </label>
      }
      flush
    >
      <QueryView query={availability}>
        {(data) => {
          const needle = search.trim().toLowerCase();
          const rows = data.rows.filter(
            (row) =>
              !needle ||
              row.product.code.toLowerCase().includes(needle) ||
              row.product.name.toLowerCase().includes(needle),
          );
          return (
            <>
              <DataTable<AvailabilityRow>
                label="Disponible para prometer"
                rows={rows}
                rowKey={(row) => row.product.id}
                empty={<EmptyState title="No hay productos con ese nombre" />}
                columns={[
                  {
                    key: 'product',
                    header: 'Producto',
                    render: (row) => <ProductCell product={row.product} />,
                  },
                  {
                    key: 'promisable',
                    header: 'Puedes prometer',
                    align: 'right',
                    render: (row) =>
                      isZero(row.promisable.quantity) ? (
                        <Chip tone="warning" icon={TriangleAlert}>
                          Sin margen
                        </Chip>
                      ) : (
                        <Qty value={row.promisable} emphasis className="text-[15px]" />
                      ),
                  },
                  {
                    key: 'onHand',
                    header: 'En bodega',
                    align: 'right',
                    hideOnMobile: true,
                    render: (row) => <Qty value={row.onHand} dimZero />,
                  },
                  {
                    key: 'committed',
                    header: 'Comprometido',
                    align: 'right',
                    render: (row) => <Qty value={row.committed} dimZero />,
                  },
                  {
                    key: 'producible',
                    header: 'Se puede fabricar',
                    align: 'right',
                    hideOnMobile: true,
                    render: (row) => <Qty value={row.producible} dimZero />,
                  },
                  {
                    key: 'limit',
                    header: 'Lo limita',
                    hideOnMobile: true,
                    render: (row) =>
                      row.limitingMaterial ? (
                        <span className="text-[13px] text-ink-2">{row.limitingMaterial.name}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      ),
                  },
                ]}
              />
              <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
                Es un estimado por producto: si dos productos usan el mismo insumo, se lo reparten.
                Puedes vender más; lo que pase de aquí queda como sobreventa y compras lo ve al
                instante.
              </p>
            </>
          );
        }}
      </QueryView>
    </Panel>
  );
}
