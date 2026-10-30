import { CircleDashed, FilePlus2, FlaskConical, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProducts } from '../../api/hooks';
import type { Product } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Chip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatCop, formatDecimal, unitLabel } from '../../lib/format';
import { INPUT, QueryPanel, ScreenTitle, SELECT, useUrlFilters } from '../inventory/erp-kit';
import { ProductFormDialog } from '../products/product-form-dialog';

const FILTERS = { tipo: '', formula: '', estado: 'activos', q: '' };

const made = (product: Product) => product.type === 'BULK' || product.type === 'FINISHED_GOOD';

const formulaMatches = (product: Product, filter: string) =>
  !filter ||
  (filter === 'draft' && product.hasDraftFormula) ||
  (filter === 'missing' && made(product) && !product.activeFormulaVersion) ||
  (filter === 'active' && Boolean(product.activeFormulaVersion));

const COLUMNS: QueryColumn<Product>[] = [
  {
    key: 'code',
    header: 'Código',
    sort: (row) => row.code,
    csv: (row) => row.code,
    render: (row) => <span className="tabular-nums">{row.code}</span>,
  },
  {
    key: 'name',
    header: 'Descripción',
    sort: (row) => row.name,
    csv: (row) => row.name,
    render: (row) => (
      <EntityLink to="product" id={row.id} className="font-medium">
        {row.name}
      </EntityLink>
    ),
  },
  {
    key: 'type',
    header: 'Tipo',
    sort: (row) => row.typeLabel,
    csv: (row) => row.typeLabel,
    render: (row) => <span className="text-ink-2">{row.typeLabel}</span>,
  },
  {
    key: 'unit',
    header: 'Und',
    csv: (row) => unitLabel(row.stockUnit),
    render: (row) => <span className="text-ink-2">{unitLabel(row.stockUnit)}</span>,
  },
  {
    key: 'batch',
    header: 'Bache',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => (row.batchCapacity ? row.batchCapacity.quantity.replace('.', ',') : ''),
    render: (row) =>
      row.batchCapacity ? (
        `${formatDecimal(row.batchCapacity.quantity)} ${unitLabel(row.batchCapacity.unit)}`
      ) : (
        <span className="text-ink-3">—</span>
      ),
  },
  {
    key: 'price',
    header: 'Precio venta',
    align: 'right',
    sort: (row) => Number(row.price ?? 0),
    csv: (row) => row.price ?? '',
    render: (row) => (row.price ? formatCop(row.price) : <span className="text-ink-3">—</span>),
  },
  {
    key: 'cost',
    header: 'Costo compra',
    align: 'right',
    hideOnMobile: true,
    sort: (row) => Number(row.cost ?? 0),
    csv: (row) => row.cost ?? '',
    render: (row) => (row.cost ? formatCop(row.cost) : <span className="text-ink-3">—</span>),
  },
  {
    key: 'formula',
    header: 'Fórmula',
    sort: (row) => (made(row) ? (row.activeFormulaVersion ? 1 : 0) : 2),
    csv: (row) =>
      made(row)
        ? [
            row.activeFormulaVersion
              ? `Vigente v${String(row.activeFormulaVersion)}`
              : 'Sin fórmula vigente',
            row.hasDraftFormula ? 'borrador por publicar' : '',
          ]
            .filter(Boolean)
            .join(', ')
        : 'No aplica',
    render: (row) =>
      !made(row) ? (
        <span className="text-ink-3">No aplica</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {row.activeFormulaVersion ? (
            <Chip tone="good" icon={FlaskConical}>
              {`Vigente v${String(row.activeFormulaVersion)}`}
            </Chip>
          ) : (
            <Chip tone="warning" icon={FlaskConical}>
              Sin fórmula vigente
            </Chip>
          )}
          {row.hasDraftFormula ? (
            <Chip tone="neutral" icon={CircleDashed}>
              Borrador por publicar
            </Chip>
          ) : null}
        </span>
      ),
  },
  {
    key: 'active',
    header: 'Estado',
    hideOnMobile: true,
    sort: (row) => (row.active ? 0 : 1),
    csv: (row) => (row.active ? 'Activo' : 'Desactivado'),
    render: (row) => (row.active ? 'Activo' : <span className="text-ink-3">Desactivado</span>),
  },
];

/** Products and formulas master: consultation in a grid; Enter opens the product record. */
export function CatalogPage() {
  useWorkTab('Productos y fórmulas');
  const { can } = useSession();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const filters = useUrlFilters(FILTERS);
  const { tipo, formula, estado, q } = filters.applied;
  const products = useProducts({ type: tipo || undefined, q: q.trim() || undefined });
  const rows = useMemo(
    () =>
      (products.data ?? []).filter(
        (product) =>
          formulaMatches(product, formula) &&
          (estado === 'todos' || (estado === 'activos' ? product.active : !product.active)),
      ),
    [products.data, formula, estado],
  );
  const all = products.data ?? [];
  const drafts = all.filter((product) => product.hasDraftFormula).length;
  const missing = all.filter((product) => made(product) && !product.activeFormulaVersion).length;

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo producto',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !can('products:write'),
            onClick: () => {
              setCreating(true);
            },
          },
          {
            label: 'Imprimir',
            icon: Printer,
            shortcut: 'Ctrl+P',
            onClick: () => {
              window.print();
            },
          },
        ]}
      />
      <ScreenTitle
        title="Productos y fórmulas"
        subtitle="Materias primas, graneles, terminados y mercancía de reventa, con la fórmula vigente de lo que se fabrica. Enter abre la ficha."
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Tipo">
              <select
                className={SELECT}
                value={filters.draft.tipo}
                onChange={(event) => {
                  filters.set('tipo', event.target.value);
                }}
              >
                <option value="">Todos</option>
                <option value="FINISHED_GOOD">Terminados</option>
                <option value="BULK">Granel</option>
                <option value="RAW_MATERIAL">Materias primas</option>
                <option value="RESALE">Reventa</option>
              </select>
            </FilterField>
            <FilterField label="Fórmula">
              <select
                className={SELECT}
                value={filters.draft.formula}
                onChange={(event) => {
                  filters.set('formula', event.target.value);
                }}
              >
                <option value="">Todas</option>
                <option value="active">Con fórmula vigente</option>
                <option value="draft">Borrador por publicar ({drafts})</option>
                <option value="missing">Sin fórmula vigente ({missing})</option>
              </select>
            </FilterField>
            <FilterField label="Estado">
              <select
                className={SELECT}
                value={filters.draft.estado}
                onChange={(event) => {
                  filters.set('estado', event.target.value);
                }}
              >
                <option value="activos">Activos</option>
                <option value="inactivos">Desactivados</option>
                <option value="todos">Todos</option>
              </select>
            </FilterField>
            <FilterField label="Código o descripción" className="w-full sm:w-60">
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={products}>
          {() => (
            <QueryGrid<Product>
              title="Productos"
              columns={COLUMNS}
              rows={rows}
              rowKey={(row) => row.id}
              onOpen={(row) => {
                void navigate(`/productos/${row.id}`);
              }}
              rowClassName={(row) => (row.active ? undefined : 'text-ink-3')}
              pageSize={100}
              empty="No hay productos con estos filtros."
            />
          )}
        </QueryView>
      </QueryPanel>
      {creating ? (
        <ProductFormDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}
