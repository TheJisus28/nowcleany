import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Ban,
  Banknote,
  Check,
  Circle,
  CircleCheck,
  Factory,
  FilePlus,
  FileText,
  HandCoins,
  History,
  ListOrdered,
  type LucideIcon,
  PackageCheck,
  PackageOpen,
  Search,
  Send,
  Truck,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { TrailEntry } from '../../api/types';
import type { Entity } from '../../app/access';
import { EntityLink } from '../../components/links';
import {
  cn,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
} from '../../components/ui';
import { plural, todayIso } from '../../lib/format';
import { colombiaDay, dayHeading, timeOf } from '../billing/billing-format';

type EntityFilter = 'all' | 'sales_order' | 'purchase_order' | 'shipment';

const ENTITY_FILTERS: readonly { value: EntityFilter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'sales_order', label: 'Preventas' },
  { value: 'purchase_order', label: 'Órdenes de compra' },
  { value: 'shipment', label: 'Guías' },
];

/** The page each kind of document opens. */
const ENTITY_LINKS: Partial<Record<string, Entity>> = {
  sales_order: 'order',
  purchase_order: 'purchase-order',
  shipment: 'shipment',
  production_order: 'production-order',
  invoice: 'invoice',
};

const ACTION_ICONS: Partial<Record<string, LucideIcon>> = {
  created: FilePlus,
  submitted: Send,
  prioritized: ListOrdered,
  invoiced: FileText,
  ready: PackageCheck,
  dispatched: Truck,
  delivered: CircleCheck,
  cancelled: Ban,
  closed: Check,
  collected: HandCoins,
  paid: Banknote,
  received: PackageOpen,
  receive: PackageOpen,
  complete: Factory,
};

const LIMIT = 500;

/** The trail with filters; the previous result stays on screen while the next one loads. */
function useTrailEntries(filter: { entityType: string; q: string; from: string }) {
  return useQuery({
    queryKey: ['trail', filter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (filter.entityType) params.set('entityType', filter.entityType);
      if (filter.q) params.set('q', filter.q);
      if (filter.from) params.set('from', filter.from);
      return api.get<TrailEntry[]>(`/v1/trail?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

export function TrailPage() {
  const [entity, setEntity] = useState<EntityFilter>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(todayIso(-30));
  const q = useDeferredValue(search.trim());
  const trail = useTrailEntries({
    entityType: entity === 'all' ? '' : entity,
    q: q.length >= 2 ? q : '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '',
  });

  return (
    <>
      <PageHeader
        title="Traza"
        description="Quién hizo cada paso, con qué rol y cuándo: preventas, facturas, cobros, compras y despachos."
      />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 xl:flex-row xl:items-center">
          <div className="overflow-x-auto">
            <Segmented
              label="Tipo de documento"
              value={entity}
              options={ENTITY_FILTERS}
              onChange={setEntity}
            />
          </div>
          <label className="relative block xl:ml-auto xl:w-72">
            <span className="sr-only">Buscar en la traza</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Documento, persona o texto"
              className="pl-9"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            Desde
            <Input
              type="date"
              value={from}
              max={todayIso()}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
              className="w-auto"
            />
          </label>
        </div>
        <QueryView query={trail}>
          {(entries) => (
            <div className={cn('transition-opacity', trail.isPlaceholderData && 'opacity-60')}>
              <Timeline entries={entries} />
            </div>
          )}
        </QueryView>
      </Panel>
    </>
  );
}

function Timeline({ entries }: { entries: TrailEntry[] }) {
  const [role, setRole] = useState<string | null>(null);
  const roles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const name = entry.actor.role ?? 'Sin rol';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([, a], [, b]) => b - a);
  }, [entries]);
  const visible =
    role === null ? entries : entries.filter((entry) => (entry.actor.role ?? 'Sin rol') === role);
  const days = useMemo(() => {
    const groups = new Map<string, TrailEntry[]>();
    for (const entry of visible) {
      const day = colombiaDay(entry.occurredAt);
      groups.set(day, [...(groups.get(day) ?? []), entry]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visible]);
  const people = new Set(visible.map((entry) => entry.actor.id)).size;
  const documents = new Set(visible.map((entry) => `${entry.entityType}:${entry.entityId}`)).size;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="Sin eventos con estos filtros"
        description="Cambia el tipo de documento, la búsqueda o la fecha desde la que buscas."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-line px-4 py-3">
        <p className="text-[13px] text-ink-2">
          <span className="font-semibold text-ink">
            {plural(visible.length, 'evento', 'eventos')}
          </span>{' '}
          · {plural(people, 'persona', 'personas')} · {plural(documents, 'documento', 'documentos')}
          {entries.length >= LIMIT
            ? ` · se muestran los ${String(LIMIT)} más recientes: acota con la fecha o la búsqueda`
            : ''}
        </p>
        {roles.length > 1 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por rol">
            <RolePill
              label="Todos los roles"
              count={entries.length}
              active={role === null}
              onClick={() => {
                setRole(null);
              }}
            />
            {roles.map(([name, count]) => (
              <RolePill
                key={name}
                label={name}
                count={count}
                active={role === name}
                onClick={() => {
                  setRole(role === name ? null : name);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {days.map(([day, list]) => (
        <section key={day} aria-label={dayHeading(day)}>
          <h2 className="sticky top-12 z-[5] border-b border-line bg-surface-2/95 px-5 py-1.5 text-[13px] font-semibold text-ink-2 backdrop-blur first-letter:uppercase lg:top-14">
            {dayHeading(day)} · {list.length}
          </h2>
          <ol className="relative py-1 before:absolute before:top-0 before:bottom-0 before:left-[93.5px] before:w-px before:bg-line sm:before:left-[105.5px]">
            {list.map((entry) => (
              <TrailItem key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function RolePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-ink-3')}>{count}</span>
    </button>
  );
}

function TrailItem({ entry }: { entry: TrailEntry }) {
  const Icon = ACTION_ICONS[entry.action] ?? Circle;
  const link = ENTITY_LINKS[entry.entityType];
  return (
    <li className="relative flex gap-3 px-5 py-3">
      <span className="w-12 shrink-0 pt-1 text-right text-[12.5px] whitespace-nowrap text-ink-2 tabular-nums sm:w-[60px] sm:text-[13px]">
        {timeOf(entry.occurredAt)}
      </span>
      <span className="relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 border-surface bg-brand-soft text-brand">
        <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-ink">{entry.summary}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
          <span className="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-ink-2">
            {entry.entityTypeLabel}
          </span>
          {link ? (
            <EntityLink to={link} id={entry.entityId} className="font-medium text-ink">
              {entry.label}
            </EntityLink>
          ) : (
            <span className="font-medium text-ink">{entry.label}</span>
          )}
          <span aria-hidden>·</span>
          <span className="text-ink-2">{entry.actor.name}</span>
          {entry.actor.role ? <span>({entry.actor.role})</span> : null}
        </p>
      </div>
    </li>
  );
}
