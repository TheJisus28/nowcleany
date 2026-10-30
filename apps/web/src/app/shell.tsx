import { ChevronRight, LogOut, Menu, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useProfile, useSession } from '../auth/session';
import { BrandLockup } from '../components/brand';
import { SearchPalette } from '../components/search-palette';
import { cn } from '../components/ui';
import { useAccess } from './access';
import { NAV_GROUPS, navItemFor, ROLE_LABELS } from './nav';

/** The module rail: NOW CLEANY navy, one group per ERP module, only the panels of the role. */
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { has } = useAccess();
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => has(item.panel)),
  })).filter((group) => group.items.length > 0);
  return (
    <nav aria-label="Módulos" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label ?? 'start'}>
          {group.label ? (
            <p className="mb-1 px-3 text-[12.5px] font-semibold tracking-[0.01em] text-rail-muted [font-stretch:110%]">
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-px">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex h-9 items-center gap-3 rounded-md px-3 text-[14px] transition-colors',
                      isActive
                        ? 'bg-white/[0.11] font-medium text-white'
                        : 'text-rail-ink hover:bg-white/[0.06] hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute top-1.5 bottom-1.5 -left-4 w-[3px] rounded-r bg-aqua"
                        />
                      ) : null}
                      <item.icon
                        aria-hidden
                        className={cn('size-[17px]', isActive ? 'text-aqua' : 'text-rail-muted')}
                        strokeWidth={2}
                      />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
      className="flex h-9 w-full max-w-[340px] items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-left text-[14px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1 truncate">Buscar en SCIP…</span>
      <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] sm:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

/** Where the user is: module › screen. */
function Breadcrumb() {
  const location = useLocation();
  const { has } = useAccess();
  const item = navItemFor(location.pathname);
  if (!item || !has(item.panel)) return <span />;
  const isDetail = location.pathname !== item.to;
  return (
    <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
      {item.group ? (
        <>
          <span className="text-ink-3">{item.group}</span>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        </>
      ) : null}
      {isDetail ? (
        <NavLink to={item.to} className="truncate text-ink-2 hover:text-brand hover:underline">
          {item.label}
        </NavLink>
      ) : (
        <span className="truncate font-medium text-ink">{item.label}</span>
      )}
    </nav>
  );
}

export function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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
    <div className="min-h-screen lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-7 bg-rail px-4 py-5 lg:flex">
        <BrandLockup inverted />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <Navigation />
        </div>
        <UserCard />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
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
          <div className="mx-auto flex h-12 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-14 lg:px-10">
            <Breadcrumb />
            <div className="hidden flex-1 justify-end lg:flex">
              <SearchButton onOpen={openSearch} />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1320px]">
            <Outlet />
          </div>
        </main>
      </div>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
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
  );
}
