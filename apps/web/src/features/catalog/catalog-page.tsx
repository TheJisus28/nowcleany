import { BookOpen, FlaskConical, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useProducts } from '../../api/hooks';
import type { Product } from '../../api/types';
import { DataTable } from '../../components/data-table';
import { EntityLink, pathTo } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip } from '../../components/status';
import { EmptyState, Input, PageHeader, Panel, QueryView, Segmented } from '../../components/ui';
import { unitLabel } from '../../lib/format';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'FINISHED_GOOD', label: 'Terminados' },
  { value: 'BULK', label: 'Granel' },
  { value: 'RAW_MATERIAL', label: 'Materias primas' },
] as const;

export function CatalogPage() {
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const products = useProducts({ type: type || undefined, q: search.trim() || undefined });

  return (
    <>
      <PageHeader
        title="Catálogo"
        description="Materias primas, graneles y productos terminados, con la fórmula vigente de cada uno."
      />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Segmented label="Tipo" value={type} onChange={setType} options={TYPES} />
          <label className="relative block md:w-72">
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
              rows={rows}
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
                    ) : row.activeFormulaVersion ? (
                      <Chip
                        tone="good"
                        icon={FlaskConical}
                      >{`Vigente v${String(row.activeFormulaVersion)}`}</Chip>
                    ) : (
                      <Chip tone="warning" icon={FlaskConical}>
                        Sin fórmula vigente
                      </Chip>
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
    </>
  );
}
