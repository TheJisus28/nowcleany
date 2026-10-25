import { BookOpen, CircleDashed, FlaskConical, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProducts } from '../../api/hooks';
import type { Product } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { EntityLink, pathTo } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip } from '../../components/status';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
} from '../../components/ui';
import { unitLabel } from '../../lib/format';
import { ProductFormDialog } from '../products/product-form-dialog';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'FINISHED_GOOD', label: 'Terminados' },
  { value: 'BULK', label: 'Granel' },
  { value: 'RAW_MATERIAL', label: 'Materias primas' },
] as const;

type FormulaFilter = 'all' | 'draft' | 'missing';

const formulaMatches = (product: Product, filter: FormulaFilter) =>
  filter === 'all' ||
  (filter === 'draft' && product.hasDraftFormula) ||
  (filter === 'missing' && product.type !== 'RAW_MATERIAL' && !product.activeFormulaVersion);

export function CatalogPage() {
  const { can } = useSession();
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('');
  const [formula, setFormula] = useState<FormulaFilter>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const products = useProducts({ type: type || undefined, q: search.trim() || undefined });
  const all = products.data ?? [];
  const drafts = all.filter((product) => formulaMatches(product, 'draft')).length;
  const missing = all.filter((product) => formulaMatches(product, 'missing')).length;

  return (
    <>
      <PageHeader
        title="Catálogo"
        description="Materias primas, graneles y productos terminados, con la fórmula de cada uno."
        actions={
          can('products:write') ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setCreating(true);
              }}
            >
              Nuevo producto
            </Button>
          ) : null
        }
      />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Segmented label="Tipo" value={type} onChange={setType} options={TYPES} />
            <Segmented
              label="Fórmula"
              value={formula}
              onChange={setFormula}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'draft', label: `Por publicar · ${String(drafts)}` },
                { value: 'missing', label: `Sin fórmula · ${String(missing)}` },
              ]}
            />
          </div>
          <label className="relative block lg:w-72">
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
        </div>
        <QueryView query={products}>
          {(rows) => (
            <DataTable<Product>
              label="Productos"
              rows={rows.filter((product) => formulaMatches(product, formula))}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void navigate(pathTo('product', row.id));
              }}
              empty={<EmptyState icon={<BookOpen />} title="No hay productos con este filtro" />}
              columns={[
                {
                  key: 'name',
                  header: 'Producto',
                  render: (row) => (
                    <span>
                      <EntityLink to="product" id={row.id} className="font-medium">
                        {row.name}
                      </EntityLink>
                      <span className="block text-[12.5px] text-ink-3">{row.code}</span>
                    </span>
                  ),
                },
                { key: 'type', header: 'Tipo', render: (row) => row.typeLabel },
                { key: 'unit', header: 'Unidad', render: (row) => unitLabel(row.stockUnit) },
                {
                  key: 'batch',
                  header: 'Bache',
                  hideOnMobile: true,
                  render: (row) =>
                    row.batchCapacity ? (
                      <Qty value={row.batchCapacity} />
                    ) : (
                      <span className="text-ink-3">—</span>
                    ),
                },
                {
                  key: 'formula',
                  header: 'Fórmula',
                  render: (row) =>
                    row.type === 'RAW_MATERIAL' ? (
                      <span className="text-ink-3">No aplica</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
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
                  render: (row) =>
                    row.active ? 'Activo' : <span className="text-ink-3">Desactivado</span>,
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
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
