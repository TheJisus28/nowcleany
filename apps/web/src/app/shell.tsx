import { ChevronDown, ChevronRight, LogOut, Menu, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useProfile, useSession } from '../auth/session';
import { BrandLockup } from '../components/brand';
import { WorkTabsBar, WorkTabsProvider } from '../components/erp/work-tabs';
import { SearchPalette } from '../components/search-palette';
import { cn } from '../components/ui';
import { useAccess } from './access';
import { NAV_GROUPS, navItemFor, ROLE_LABELS } from './nav';

const OPEN_MODULES = 'scip.menu.open';

function readOpen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OPEN_MODULES) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * The module tree, as in traditional systems: each module unfolds into Documentos, Consultas, Informes and
 * Maestros, only with what the role uses. Open modules are remembered.
 */
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { has } = useAccess();
  const location = useLocation();
  const active = navItemFor(location.pathname);
  const [open, setOpen] = useState<string[]>(readOpen);
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    sections: group.sections
      .map((section) => ({ ...section, items: section.items.filter((item) => has(item.panel)) }))
      .filter((section) => section.items.length > 0),
  })).filter((group) => group.sections.length > 0);

  const toggle = (label: string) => {
    setOpen((current) => {
      const next = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label];
      try {
        localStorage.setItem(OPEN_MODULES, JSON.stringify(next));
      } catch {
        // Private mode: the menu forgets.
      }
      return next;
    });
  };

  const itemLink = (item: (typeof groups)[number]['sections'][number]['items'][number]) => {
    const isActive = active?.to === item.to;
    return (
      <li key={item.to}>
        <Link
          to={item.to}
          onClick={onNavigate}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'relative flex h-8 items-center gap-2.5 rounded-md px-3 text-[13.5px] transition-colors',
            isActive
              ? 'bg-white/[0.11] font-medium text-white'
              : 'text-rail-ink hover:bg-white/[0.06] hover:text-white',
          )}
        >
          {isActive ? (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 -left-4 w-[3px] rounded-r bg-aqua"
            />
          ) : null}
          <item.icon
            aria-hidden
            className={cn('size-4 shrink-0', isActive ? 'text-aqua' : 'text-rail-muted')}
            strokeWidth={2}
          />
          <span className="truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Módulos" className="flex flex-col gap-1">
      {groups.map((group) => {
        if (!group.label) {
          return (
            <ul key="start" className="mb-2 flex flex-col gap-px">
              {group.sections.flatMap((section) => section.items).map(itemLink)}
            </ul>
          );
        }
        const label = group.label;
        const expanded = open.includes(label) || active?.group === label;
        const Icon = group.icon;
        return (
          <div key={label}>
            <button
              type="button"
              onClick={() => {
                toggle(label);
              }}
              aria-expanded={expanded}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13.5px] font-semibold text-white/90 hover:bg-white/[0.06]"
            >
              {Icon ? <Icon aria-hidden className="size-4 text-rail-muted" /> : null}
              <span className="flex-1 [font-stretch:108%]">{label}</span>
              {expanded ? (
                <ChevronDown aria-hidden className="size-3.5 text-rail-muted" />
              ) : (
                <ChevronRight aria-hidden className="size-3.5 text-rail-muted" />
              )}
            </button>
            {expanded ? (
              <div className="mt-0.5 mb-2 ml-3 border-l border-white/10 pl-2">
                {group.sections.map((section) => (
                  <div key={section.kind ?? 'items'} className="mt-1.5 first:mt-0.5">
                    {section.kind ? (
                      <p className="px-3 pb-0.5 text-[11.5px] text-rail-muted">{section.kind}</p>
                    ) : null}
                    <ul className="flex flex-col gap-px">{section.items.map(itemLink)}</ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function UserCard() {
  const profile = useProfile();
  const { logout } = useSession();
  const initials = profile.fullName
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 border-t border-white/10 pt-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-aqua/15 text-[13px] font-semibold text-aqua">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{profile.fullName}</p>
        <p className="truncate text-[12.5px] text-rail-muted">
          {profile.roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        className="rounded-md p-2 text-rail-muted hover:bg-white/10 hover:text-white"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-8 w-full max-w-[380px] items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-left text-[13.5px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1 truncate">Buscar menú o documento (FV-, OC-, PV-, cliente…)</span>
      <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] sm:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const titleFor = useCallback((path: string) => {
    const item = navItemFor(path);
    if (!item) return 'Documento';
    return path === item.to ? item.label : `${item.label} · detalle`;
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') ||
        (event.key === 'F3' && !document.querySelector('dialog[open]'))
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const openSearch = () => {
    setMenuOpen(false);
    setSearchOpen(true);
  };

  return (
    <WorkTabsProvider titleFor={titleFor}>
      <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
        <aside className="no-print sticky top-0 hidden h-screen flex-col gap-6 bg-rail px-4 py-5 lg:flex">
          <BrandLockup inverted />
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <Navigation />
          </div>
          <UserCard />
        </aside>

        <div className="min-w-0">
          <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
            <div className="flex h-14 items-center gap-3 bg-rail px-4 lg:hidden">
              <BrandLockup inverted />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={openSearch}
                  className="rounded-md p-2 text-rail-ink hover:bg-white/10"
                  aria-label="Buscar"
                >
                  <Search className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(true);
                  }}
                  className="rounded-md p-2 text-rail-ink hover:bg-white/10"
                  aria-label="Abrir menú"
                  aria-expanded={menuOpen}
                >
                  <Menu className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex h-11 items-end gap-4 pr-4 pl-2 sm:pr-6 lg:pr-10 lg:pl-6">
              <WorkTabsBar />
              <div className="hidden shrink-0 self-center lg:block">
                <SearchButton onOpen={openSearch} />
              </div>
            </div>
          </header>

          <main className="px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
            <div className="mx-auto max-w-[1400px]">
              <Outlet />
            </div>
          </main>
        </div>

        {menuOpen ? (
          <div
            className="no-print fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
          >
            <button
              type="button"
              aria-label="Cerrar menú"
              className="absolute inset-0 bg-ink/50"
              onClick={() => {
                setMenuOpen(false);
              }}
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col gap-6 bg-rail px-4 py-5 shadow-xl">
              <div className="flex items-center justify-between">
                <BrandLockup inverted />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                  }}
                  className="rounded-md p-2 text-rail-muted hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar menú"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Navigation
                  onNavigate={() => {
                    setMenuOpen(false);
                  }}
                />
              </div>
              <UserCard />
            </div>
          </div>
        ) : null}

        <SearchPalette
          open={searchOpen}
          onClose={() => {
            setSearchOpen(false);
          }}
        />
      </div>
    </WorkTabsProvider>
  );
}
