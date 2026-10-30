import { CalendarDays, CircleCheck, Contact, MapPinned, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSellers, useVisits } from '../../api/hooks';
import type { Visit } from '../../api/types';
import { useSession } from '../../auth/session';
import { Kpi } from '../../components/kpi';
import { EntityLink } from '../../components/links';
import { MapView } from '../../components/map/map-view';
import type { MapLink, MapMarker } from '../../components/map/types';
import {
  EmptyState,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Select,
  cn,
} from '../../components/ui';
import { todayIso } from '../../lib/format';
import { formatDistance, VisitPlaceChip } from './visit-place';

type Period = '1' | '7' | '14' | '30';
type Place = 'all' | 'onSite' | 'far';

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: '1', label: 'Hoy' },
  { value: '7', label: '7 días' },
  { value: '14', label: '14 días' },
  { value: '30', label: '30 días' },
];

const PLACES: readonly { value: Place; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'onSite', label: 'En sitio' },
  { value: 'far', label: 'Lejos' },
];

/** Colombia calendar day of an instant ("2026-10-29"). */
const dayOf = (instant: string) =>
  new Date(new Date(instant).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

const timeOf = (instant: string) =>
  new Date(instant).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

const dayLabel = (day: string, style: 'short' | 'long' = 'short') =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', {
    weekday: style,
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    timeZone: 'UTC',
  });

export function VisitsPage() {
  const { can } = useSession();
  const seesAll = can('visits:read-all');
  const [period, setPeriod] = useState<Period>('7');
  const [place, setPlace] = useState<Place>('all');
  const [sellerId, setSellerId] = useState('');
  const sellers = useSellers(seesAll);
  const days = Number(period);
  const visits = useVisits({
    from: todayIso(-(days - 1)),
    to: todayIso(),
    sellerId: sellerId || undefined,
  });

  return (
    <>
      <PageHeader
        title="Visitas"
        description={
          seesAll
            ? 'Cuándo y dónde estuvo cada vendedor con sus clientes, verificado con el GPS del celular.'
            : 'Tus visitas registradas desde la app, comparadas con la ubicación de cada sucursal.'
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="Periodo" value={period} options={PERIODS} onChange={setPeriod} />
        <Segmented label="Lugar" value={place} options={PLACES} onChange={setPlace} />
        {seesAll ? (
          <div className="w-full sm:w-56">
            <Select
              aria-label="Vendedor"
              value={sellerId}
              onChange={(event) => {
                setSellerId(event.target.value);
              }}
            >
              <option value="">Todos los vendedores</option>
              {(sellers.data ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      <QueryView query={visits}>
        {(rows) => (
          <VisitsBoard
            visits={rows.filter((visit) =>
              place === 'all'
                ? true
                : place === 'onSite'
                  ? visit.onSite === true
                  : visit.onSite === false,
            )}
            days={days}
            showSellers={seesAll && !sellerId}
          />
        )}
      </QueryView>
    </>
  );
}

function VisitsBoard({
  visits,
  days,
  showSellers,
}: {
  visits: Visit[];
  days: number;
  showSellers: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const onSite = visits.filter((visit) => visit.onSite === true).length;
  const far = visits.filter((visit) => visit.onSite === false).length;
  const customers = new Set(visits.map((visit) => visit.customer.id)).size;
  const withOrder = visits.filter((visit) => visit.order).length;

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
        title: `${visit.seller.name} · ${dayLabel(dayOf(visit.visitedAt))} ${timeOf(visit.visitedAt)}`,
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

  const byDay = useMemo(() => {
    const groups = new Map<string, Visit[]>();
    for (const visit of visits) {
      const day = dayOf(visit.visitedAt);
      groups.set(day, [...(groups.get(day) ?? []), visit]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visits]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Visitas"
          value={visits.length}
          icon={MapPinned}
          tone="brand"
          hint={`${String(withOrder)} con preventa`}
        />
        <Kpi
          label="En sitio"
          value={visits.length ? `${String(Math.round((onSite / visits.length) * 100))} %` : '—'}
          icon={CircleCheck}
          tone="good"
          hint={`${String(onSite)} a menos de 150 m de la sucursal`}
        />
        <Kpi
          label="Lejos de la sucursal"
          value={far}
          icon={TriangleAlert}
          tone={far > 0 ? 'warning' : 'neutral'}
          hint="Marcaron la visita desde otro lugar"
        />
        <Kpi label="Clientes visitados" value={customers} icon={Contact} />
      </div>

      {showSellers ? <SellerDays visits={visits} days={days} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel flush className="self-start overflow-hidden">
          <MapView
            label="Mapa de visitas"
            className="h-[460px] w-full"
            markers={markers}
            links={links}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
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
          </div>
        </Panel>

        <Panel title="Recorrido" description="Las visitas de cada día, en orden." flush>
          {byDay.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Sin visitas en este periodo"
              description="Las visitas se registran desde la app de vendedores, con el GPS del celular."
            />
          ) : (
            <div className="max-h-[512px] overflow-y-auto">
              {byDay.map(([day, list]) => (
                <section key={day}>
                  <h3 className="sticky top-0 z-[1] border-b border-line bg-surface-2 px-5 py-1.5 text-[13px] font-semibold text-ink-2 first-letter:uppercase">
                    {dayLabel(day, 'long')} · {list.length}
                  </h3>
                  <ul className="divide-y divide-line">
                    {[...list]
                      .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
                      .map((visit) => (
                        <li
                          key={visit.id}
                          className={cn(
                            'flex gap-3 px-5 py-3 text-sm transition-colors',
                            selected === visit.id && 'bg-brand-soft/60',
                          )}
                        >
                          <span className="w-[74px] shrink-0 whitespace-nowrap text-ink-2 tabular-nums">
                            {timeOf(visit.visitedAt)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              <EntityLink
                                to="customer"
                                id={visit.customer.id}
                                className="font-medium"
                              >
                                {visit.customer.name}
                              </EntityLink>
                              <span className="text-ink-3"> · {visit.branch.name}</span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                              {showSellers ? <span>{visit.seller.name}</span> : null}
                              <VisitPlaceChip visit={visit} />
                              {visit.order ? (
                                <EntityLink to="order" id={visit.order.id}>
                                  {visit.order.label}
                                </EntityLink>
                              ) : null}
                            </p>
                            {visit.notes ? (
                              <p className="mt-1 text-[13px] text-ink-3">{visit.notes}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Sequential single-hue steps (series-1 blue), light to dark, for visits per day. */
const STEPS = ['bg-surface-2', 'bg-[#d6e6f8]', 'bg-[#a9c9ef]', 'bg-[#6fa3e3]', 'bg-[#2a78d6]'];

/** Which days each seller was out visiting customers, and how many visits. */
function SellerDays({ visits, days }: { visits: Visit[]; days: number }) {
  const shown = Math.min(days, 14);
  const dayList = Array.from({ length: shown }, (_, index) => todayIso(-(shown - 1 - index)));
  const sellers = useMemo(() => {
    const rows = new Map<string, { name: string; perDay: Map<string, Visit[]> }>();
    for (const visit of visits) {
      const row = rows.get(visit.seller.id) ?? {
        name: visit.seller.name,
        perDay: new Map<string, Visit[]>(),
      };
      const day = dayOf(visit.visitedAt);
      row.perDay.set(day, [...(row.perDay.get(day) ?? []), visit]);
      rows.set(visit.seller.id, row);
    }
    return [...rows.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [visits]);
  if (sellers.length === 0 || shown < 2) return null;

  return (
    <Panel
      title="Días en la calle"
      description={`Visitas por vendedor y día (últimos ${String(shown)} días). Los recuadros con aviso tienen visitas lejos de la sucursal.`}
    >
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
      <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
        <span>Menos</span>
        {STEPS.map((step) => (
          <span key={step} className={cn('size-3.5 rounded-[3px]', step)} />
        ))}
        <span>Más visitas</span>
      </div>
    </Panel>
  );
}
