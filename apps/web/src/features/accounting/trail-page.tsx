import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import type { TrailEntry } from '../../api/types';
import { useAccess } from '../../app/access';
import {
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { cn, QueryView } from '../../components/ui';
import { todayIso } from '../../lib/format';
import { colombiaDateTime, colombiaDay, normalizeText } from '../billing/billing-format';
import { FILTER_INPUT, ScreenTitle, useQueryFilters } from '../billing/erp-kit';
import { actionLabel, ENTITY_LINKS, ENTITY_NAMES, ENTITY_TYPES } from './trail-labels';

const LIMIT = 1000;

/** The trail with the server filters; the previous result stays on screen while the next loads. */
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

/** "Auditoría (traza)": who did each step, with what role and when, in a paged grid. */
export function TrailPage() {
  useWorkTab('Auditoría');
  const navigate = useNavigate();
  const { canOpen } = useAccess();
  const filters = useQueryFilters({
    desde: todayIso(-30),
    hasta: todayIso(),
    tipo: '',
    usuario: '',
    rol: '',
    texto: '',
  });
  const { draft, set } = filters;
  const { desde, hasta, tipo, usuario, rol, texto } = filters.applied;
  const trail = useTrailEntries({
    entityType: tipo,
    q: texto.trim().length >= 2 ? texto.trim() : '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : '',
  });

  const roles = useMemo(
    () =>
      [...new Set((trail.data ?? []).map((entry) => entry.actor.role ?? 'Sin rol'))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [trail.data],
  );
  const rows = useMemo(() => {
    const person = normalizeText(usuario.trim());
    return (trail.data ?? []).filter(
      (entry) =>
        (!hasta || colombiaDay(entry.occurredAt) <= hasta) &&
        (!rol || (entry.actor.role ?? 'Sin rol') === rol) &&
        (!person || normalizeText(entry.actor.name).includes(person)),
    );
  }, [trail.data, hasta, rol, usuario]);

  const columns: QueryColumn<TrailEntry>[] = [
    {
      key: 'at',
      header: 'Fecha y hora',
      className: 'whitespace-nowrap tabular-nums text-ink-2',
      render: (entry) => colombiaDateTime(entry.occurredAt),
      sort: (entry) => entry.occurredAt,
      csv: (entry) => colombiaDateTime(entry.occurredAt),
    },
    {
      key: 'type',
      header: 'Tipo de documento',
      hideOnMobile: true,
      render: (entry) => ENTITY_NAMES[entry.entityType] ?? entry.entityTypeLabel,
      sort: (entry) => entry.entityType,
      csv: (entry) => ENTITY_NAMES[entry.entityType] ?? entry.entityTypeLabel,
    },
    {
      key: 'document',
      header: 'Documento',
      className: 'whitespace-nowrap font-medium',
      render: (entry) => {
        const link = ENTITY_LINKS[entry.entityType];
        return link ? (
          <EntityLink to={link} id={entry.entityId}>
            {entry.label}
          </EntityLink>
        ) : (
          entry.label
        );
      },
      sort: (entry) => entry.label,
      csv: (entry) => entry.label,
    },
    {
      key: 'action',
      header: 'Acción',
      className: 'whitespace-nowrap',
      render: (entry) => actionLabel(entry.action),
      sort: (entry) => actionLabel(entry.action),
      csv: (entry) => actionLabel(entry.action),
    },
    {
      key: 'actor',
      header: 'Usuario',
      render: (entry) => entry.actor.name,
      sort: (entry) => entry.actor.name,
      csv: (entry) => entry.actor.name,
    },
    {
      key: 'role',
      header: 'Rol',
      className: 'text-ink-2',
      render: (entry) => entry.actor.role ?? '—',
      sort: (entry) => entry.actor.role ?? '',
      csv: (entry) => entry.actor.role ?? '',
    },
    {
      key: 'summary',
      header: 'Detalle',
      render: (entry) => entry.summary,
      csv: (entry) => entry.summary,
    },
  ];

  return (
    <>
      <ScreenTitle
        title="Auditoría (traza)"
        description="Quién hizo y autorizó cada paso, con qué rol y cuándo: pedidos, facturas, recibos de caja, guías, compras y producción. Enter o doble clic abre el documento."
        aside={
          trail.data && trail.data.length >= LIMIT
            ? `Se muestran los ${String(LIMIT)} eventos más recientes: acota las fechas o el texto.`
            : undefined
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
        <FilterField label="Tipo de documento">
          <select
            value={draft.tipo}
            onChange={(event) => {
              set('tipo', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todos</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Usuario">
          <input
            value={draft.usuario}
            onChange={(event) => {
              set('usuario', event.target.value);
            }}
            className={`${FILTER_INPUT} w-40`}
          />
        </FilterField>
        <FilterField label="Rol">
          <select
            value={draft.rol}
            onChange={(event) => {
              set('rol', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todos</option>
            {roles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Documento o texto">
          <input
            value={draft.texto}
            placeholder="PV-00031, FV-00012…"
            onChange={(event) => {
              set('texto', event.target.value);
            }}
            className={`${FILTER_INPUT} w-48`}
          />
        </FilterField>
      </FilterBar>
      <QueryView query={trail}>
        {() => (
          <div className={cn('transition-opacity', trail.isPlaceholderData && 'opacity-60')}>
            <QueryGrid
              title="Auditoría"
              exportName="auditoria"
              columns={columns}
              rows={rows}
              rowKey={(entry) => entry.id}
              initialSort={{ key: 'at', direction: 'desc' }}
              onOpen={(entry) => {
                const link = ENTITY_LINKS[entry.entityType];
                if (link && canOpen(link)) void navigate(pathTo(link, entry.entityId));
              }}
              empty="Sin eventos con estos filtros. Cambia las fechas, el tipo de documento o el texto."
            />
          </div>
        )}
      </QueryView>
    </>
  );
}
