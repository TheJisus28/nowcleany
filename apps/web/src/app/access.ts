import { useMemo } from 'react';
import { useSession } from '../auth/session';
import { NAV, PANELS_BY_ROLE, type Panel } from './nav';

/** Records that have their own page; links to them render only where the user can open them. */
export type Entity = 'product' | 'order' | 'customer' | 'production-order' | 'purchase-order';

/** Panels from which each record is reachable (its page shows only what that panel needs). */
const ENTITY_PANELS: Record<Entity, readonly Panel[]> = {
  product: ['summary', 'home', 'sales', 'plant', 'purchasing', 'inventory', 'catalog'],
  order: ['summary', 'home', 'sales', 'visits', 'plant', 'inventory'],
  customer: ['summary', 'customers', 'visits'],
  'production-order': ['summary', 'plant'],
  'purchase-order': ['summary', 'purchasing', 'inventory'],
};

export interface Access {
  panels: ReadonlySet<Panel>;
  has: (panel: Panel) => boolean;
  canOpen: (entity: Entity) => boolean;
  home: string;
}

export function panelsFor(roles: readonly string[]): Set<Panel> {
  return new Set(roles.flatMap((role) => PANELS_BY_ROLE[role] ?? []));
}

export function useAccess(): Access {
  const { profile } = useSession();
  const roles = profile?.roles;
  return useMemo(() => {
    const panels = panelsFor(roles ?? []);
    const has = (panel: Panel) => panels.has(panel);
    return {
      panels,
      has,
      canOpen: (entity) => ENTITY_PANELS[entity].some(has),
      home: NAV.find((item) => panels.has(item.panel))?.to ?? '/sin-acceso',
    };
  }, [roles]);
}
