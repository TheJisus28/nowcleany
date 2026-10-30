import { MapPinned, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useSellers, useVisits } from '../../api/hooks';
import type { Visit } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { MapView } from '../../components/map/map-view';
import type { MapLink, MapMarker } from '../../components/map/types';
import { cn, QueryView } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/format';
import { colombiaDay, normalizeText, timeOf } from '../billing/billing-format';
import { FILTER_INPUT, GridTitle, ScreenTitle, useQueryFilters } from '../billing/erp-kit';
import { formatDistance, VisitPlaceChip } from './visit-place';

const dayLabel = (day: string, style: 'short' | 'long' = 'short') =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', {
    weekday: style,
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    timeZone: 'UTC',
  });

const placeText = (visit: Visit) =>
  visit.onSite === null ? 'Sucursal sin ubicar' : visit.onSite ? 'En sitio' : 'Lejos';

/** Days between two calendar dates, both included. */
function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

/** "Visitas de vendedores": where and when each seller was at a customer, checked with GPS. */
export function VisitsPage() {
  const { can } = useSession();
  const seesAll = can('visits:read-all');
  useWorkTab('Visitas de vendedores');
  const filters = useQueryFilters({
    desde: todayIso(-6),
    hasta: todayIso(),
    vendedor: '',
    lugar: 'all',
    cliente: '',
  });
  const { draft, set } = filters;
  const { desde, hasta, vendedor, lugar, cliente } = filters.applied;
  const sellers = useSellers(seesAll);
  const visits = useVisits({
    from: desde || undefined,
    to: hasta || undefined,
    sellerId: vendedor || undefined,
  });
  const rows = useMemo(() => {
    const customer = normalizeText(cliente.trim());
    return (visits.data ?? []).filter(
      (visit) =>
        (lugar === 'all' ||
          (lugar === 'onSite' && visit.onSite === true) ||
          (lugar === 'far' && visit.onSite === false) ||
          (lugar === 'unknown' && visit.onSite === null)) &&
        (!customer ||
          normalizeText(`${visit.customer.name} ${visit.branch.name}`).includes(customer)),
    );
  }, [visits.data, lugar, cliente]);

  return (
    <>
      <ScreenTitle
        title="Visitas de vendedores"
        description={
          seesAll
            ? 'Cuándo y dónde estuvo cada vendedor con sus clientes, verificado con el GPS del celular.'
            : 'Tus visitas registradas desde la app, comparadas con la ubicación de cada sucursal.'
        }
      />
      <FilterBar onSubmit={filters.submit}>
        <FilterField label="Desde">
          <input
            type="date"
            value={draft.desde}
            max={todayIso()}
            onChange={(event) => {
              set('desde', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={draft.hasta}
            max={todayIso()}
            onChange={(event) => {
              set('hasta', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        {seesAll ? (
          <FilterField label="Vendedor">
            <select
              value={draft.vendedor}
              onChange={(event) => {
                set('vendedor', event.target.value);
              }}
              className={FILTER_INPUT}
            >
              <option value="">Todos</option>
              {(sellers.data ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Lugar">
          <select
            value={draft.lugar}
            onChange={(event) => {
              set('lugar', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="all">Todas</option>
            <option value="onSite">En sitio</option>
            <option value="far">Lejos de la sucursal</option>
            <option value="unknown">Sucursal sin ubicar</option>
          </select>
        </FilterField>
        <FilterField label="Cliente o sucursal">
          <input
            value={draft.cliente}
            onChange={(event) => {
              set('cliente', event.target.value);
            }}
            className={`${FILTER_INPUT} w-52`}
          />
        </FilterField>
      </FilterBar>
      <QueryView query={visits}>
        {() => (
          <VisitsBoard
            visits={rows}
            days={daysBetween(desde, hasta)}
            lastDay={hasta || todayIso()}
            showSellers={seesAll && !vendedor}
          />
        )}
      </QueryView>
    </>
  );
}

function VisitsBoard({
  visits,
  days,
  lastDay,
  showSellers,
}: {
  visits: Visit[];
  days: number;
  lastDay: string;
  showSellers: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const onSite = visits.filter((visit) => visit.onSite === true).length;
  const far = visits.filter((visit) => visit.onSite === false).length;
  const customers = new Set(visits.map((visit) => visit.customer.id)).size;
  const withOrder = visits.filter((visit) => visit.order).length;
  const focused = visits.find((visit) => visit.id === selected);

  const { markers, links } = useMemo(() => {
    const branchMarkers = new Map<string, MapMarker>();
    const visitMarkers: MapMarker[] = [];
    const farLinks: MapLink[] = [];
    for (const visit of visits) {
      const { branch } = visit;
      if (branch.latitude !== null && branch.longitude !== null && !branchMarkers.has(branch.id)) {
        branchMarkers.set(branch.id, {
          id: `branch-${branch.id}`,
          tone: 'brand',
          title: `${visit.customer.name} · ${branch.name}`,
          lines: [branch.address, branch.city].filter((line): line is string => Boolean(line)),
          latitude: branch.latitude,
          longitude: branch.longitude,
        });
      }
      visitMarkers.push({
        id: visit.id,
        shape: 'dot',
        tone: visit.onSite === null ? 'muted' : visit.onSite ? 'good' : 'warning',
        title: `${visit.seller.name} · ${dayLabel(colombiaDay(visit.visitedAt))} ${timeOf(visit.visitedAt)}`,
        lines: [
          `${visit.customer.name} (${visit.branch.name})`,
          visit.distanceM === null
            ? 'Sucursal sin ubicar'
            : visit.onSite
              ? `En sitio, a ${formatDistance(visit.distanceM)}`
              : `Lejos: a ${formatDistance(visit.distanceM)} de la sucursal`,
        ],
        latitude: visit.latitude,
        longitude: visit.longitude,
        onClick: () => {
          setSelected(visit.id);
        },
      });
      if (visit.onSite === false && branch.latitude !== null && branch.longitude !== null) {
        farLinks.push({
          from: { latitude: visit.latitude, longitude: visit.longitude },
          to: { latitude: branch.latitude, longitude: branch.longitude },
          tone: 'warning',
        });
      }
    }
    return { markers: [...branchMarkers.values(), ...visitMarkers], links: farLinks };
  }, [visits]);

  const columns: QueryColumn<Visit>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (visit) => (
        <span className="whitespace-nowrap">{formatDate(colombiaDay(visit.visitedAt))}</span>
      ),
      sort: (visit) => visit.visitedAt,
      csv: (visit) => colombiaDay(visit.visitedAt),
    },
    {
      key: 'time',
      header: 'Hora',
      className: 'whitespace-nowrap tabular-nums text-ink-2',
      render: (visit) => timeOf(visit.visitedAt),
      sort: (visit) => visit.visitedAt,
      csv: (visit) => timeOf(visit.visitedAt),
    },
    ...(showSellers
      ? [
          {
            key: 'seller',
            header: 'Vendedor',
            render: (visit: Visit) => visit.seller.name,
            sort: (visit: Visit) => visit.seller.name,
            csv: (visit: Visit) => visit.seller.name,
          },
        ]
      : []),
    {
      key: 'customer',
      header: 'Cliente',
      render: (visit) => (
        <EntityLink to="customer" id={visit.customer.id} className="font-medium">
          {visit.customer.name}
        </EntityLink>
      ),
      sort: (visit) => visit.customer.name,
      csv: (visit) => visit.customer.name,
    },
    {
      key: 'branch',
      header: 'Sucursal',
      render: (visit) => visit.branch.name,
      sort: (visit) => visit.branch.name,
      csv: (visit) => visit.branch.name,
    },
    {
      key: 'place',
      header: 'Lugar',
      render: (visit) => <VisitPlaceChip visit={visit} />,
      sort: placeText,
      csv: placeText,
    },
    {
      key: 'distance',
      header: 'Distancia',
      align: 'right',
      hideOnMobile: true,
      render: (visit) => (visit.distanceM === null ? '—' : formatDistance(visit.distanceM)),
      sort: (visit) => visit.distanceM ?? 0,
      csv: (visit) => (visit.distanceM === null ? '' : Math.round(visit.distanceM)),
    },
    {
      key: 'accuracy',
      header: 'Precisión GPS',
      align: 'right',
      hideOnMobile: true,
      render: (visit) =>
        visit.accuracyM === null ? '—' : `± ${String(Math.round(visit.accuracyM))} m`,
      csv: (visit) => (visit.accuracyM === null ? '' : Math.round(visit.accuracyM)),
    },
    {
      key: 'order',
      header: 'Pedido',
      render: (visit) =>
        visit.order ? (
          <EntityLink to="order" id={visit.order.id}>
            {visit.order.label}
          </EntityLink>
        ) : (
          <span className="text-ink-3">—</span>
        ),
      csv: (visit) => visit.order?.label ?? '',
      total: (list) => `${String(list.filter((visit) => visit.order).length)} con pedido`,
    },
    {
      key: 'notes',
      header: 'Observaciones',
      hideOnMobile: true,
      render: (visit) => visit.notes ?? <span className="text-ink-3">—</span>,
      csv: (visit) => visit.notes ?? '',
    },
  ];

  return (
    <div className="mt-3 flex flex-col gap-4">
      <p className="text-[13px] text-ink-2 tabular-nums">
        <span className="font-semibold text-ink">{visits.length}</span> visitas ·{' '}
        <span className="font-semibold text-ink">
          {visits.length ? `${String(Math.round((onSite / visits.length) * 100))} %` : '—'}
        </span>{' '}
        en sitio ·{' '}
        <span className={cn('font-semibold', far > 0 ? 'text-[#b67d00]' : 'text-ink')}>{far}</span>{' '}
        lejos de la sucursal · <span className="font-semibold text-ink">{customers}</span> clientes
        visitados · <span className="font-semibold text-ink">{withOrder}</span> con pedido
      </p>

      <div ref={mapRef} className="overflow-hidden rounded-[8px] border border-line bg-surface">
        <MapView
          label="Mapa de visitas"
          className="h-[400px] w-full"
          markers={markers}
          links={links}
          focus={focused ? { latitude: focused.latitude, longitude: focused.longitude } : null}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-good ring-2 ring-white" /> Visita en sitio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#e09a00] ring-2 ring-white" /> Visita lejos
            (línea punteada hasta la sucursal)
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinned aria-hidden className="size-3.5 text-brand" /> Sucursal del cliente
          </span>
          {focused ? (
            <span className="ml-auto font-medium text-ink">
              Ubicada: {focused.customer.name} · {timeOf(focused.visitedAt)}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <GridTitle aside="Enter o doble clic ubica la visita en el mapa">Recorrido</GridTitle>
        <QueryGrid
          title="Recorrido de visitas"
          exportName="visitas"
          columns={columns}
          rows={visits}
          rowKey={(visit) => visit.id}
          initialSort={{ key: 'date', direction: 'asc' }}
          onOpen={(visit) => {
            setSelected(visit.id);
            mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          rowClassName={(visit) => (visit.id === selected ? 'bg-brand-soft/60' : undefined)}
          empty="Sin visitas en este periodo. Las visitas se registran desde la app de vendedores, con el GPS del celular."
        />
      </div>

      {showSellers ? <SellerDays visits={visits} days={days} lastDay={lastDay} /> : null}
    </div>
  );
}

/** Sequential single-hue steps (series-1 blue), light to dark, for visits per day. */
const STEPS = ['bg-surface-2', 'bg-[#d6e6f8]', 'bg-[#a9c9ef]', 'bg-[#6fa3e3]', 'bg-[#2a78d6]'];

/** Which days each seller was out visiting customers, and how many visits. */
function SellerDays({ visits, days, lastDay }: { visits: Visit[]; days: number; lastDay: string }) {
  const shown = Math.min(days, 14);
  const dayList = Array.from({ length: shown }, (_, index) =>
    new Date(Date.parse(`${lastDay}T12:00:00Z`) - (shown - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  const sellers = useMemo(() => {
    const rows = new Map<string, { name: string; perDay: Map<string, Visit[]> }>();
    for (const visit of visits) {
      const row = rows.get(visit.seller.id) ?? {
        name: visit.seller.name,
        perDay: new Map<string, Visit[]>(),
      };
      const day = colombiaDay(visit.visitedAt);
      row.perDay.set(day, [...(row.perDay.get(day) ?? []), visit]);
      rows.set(visit.seller.id, row);
    }
    return [...rows.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [visits]);
  if (sellers.length === 0 || shown < 2) return null;

  return (
    <section className="rounded-[8px] border border-line bg-surface px-5 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-semibold">Días en la calle por vendedor</h2>
        <p className="text-[12px] text-ink-3">
          Visitas por día (últimos {shown} días del rango); el aviso marca visitas lejos de la
          sucursal.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[12.5px]">
          <thead>
            <tr>
              <th className="pr-3 text-left font-medium text-ink-3">Vendedor</th>
              {dayList.map((day) => (
                <th
                  key={day}
                  className="w-9 text-center font-normal text-ink-3 first-letter:uppercase"
                >
                  {dayLabel(day).split(' ')[0]?.replace('.', '')}
                  <span className="block text-ink-2 tabular-nums">{day.slice(8)}</span>
                </th>
              ))}
              <th className="pl-3 text-right font-medium text-ink-3">Días</th>
            </tr>
          </thead>
          <tbody>
            {sellers.map(([id, row]) => (
              <tr key={id}>
                <th scope="row" className="pr-3 text-left font-medium whitespace-nowrap text-ink">
                  {row.name}
                </th>
                {dayList.map((day) => {
                  const list = row.perDay.get(day) ?? [];
                  const farCount = list.filter((visit) => visit.onSite === false).length;
                  const label =
                    list.length === 0
                      ? `${dayLabel(day, 'long')}: sin visitas`
                      : `${dayLabel(day, 'long')}: ${String(list.length)} visitas${farCount ? `, ${String(farCount)} lejos` : ''}`;
                  return (
                    <td key={day} className="p-0">
                      <span
                        title={label}
                        aria-label={label}
                        className={cn(
                          'relative grid h-8 w-9 place-items-center rounded-[4px] tabular-nums',
                          STEPS[Math.min(list.length, STEPS.length - 1)],
                          list.length >= 4 ? 'text-white' : 'text-ink',
                        )}
                      >
                        {list.length || ''}
                        {farCount > 0 ? (
                          <TriangleAlert
                            aria-hidden
                            className="absolute -top-1 -right-1 size-3 rounded-full bg-surface text-[#b67d00]"
                            strokeWidth={2.5}
                          />
                        ) : null}
                      </span>
                    </td>
                  );
                })}
                <td className="pl-3 text-right font-semibold tabular-nums">{row.perDay.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
