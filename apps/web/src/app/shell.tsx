import { LogOut, Menu, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useProfile, useSession } from '../auth/session';
import { BrandLockup } from '../components/brand';
import { SearchPalette } from '../components/search-palette';
import { cn } from '../components/ui';
import { useAccess } from './access';
import { NAV, ROLE_LABELS } from './nav';

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { has } = useAccess();
  return (
    <nav aria-label="Paneles" className="flex flex-col gap-0.5">
      {NAV.filter((item) => has(item.panel)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'relative flex h-10 items-center gap-3 rounded-md px-3 text-[14.5px] font-medium transition-colors',
              isActive ? 'bg-brand text-white' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-aqua"
                />
              ) : null}
              <item.icon aria-hidden className="size-[18px]" strokeWidth={2} />
              {item.label}
            </>
          )}
        </NavLink>
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
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{profile.fullName}</p>
        <p className="truncate text-[12.5px] text-ink-3">
          {profile.roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void logout();
        }}
        className="rounded-md p-2 text-ink-3 hover:bg-surface-2 hover:text-ink"
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
      className="flex h-10 w-full items-center gap-2.5 rounded-md border border-line bg-surface-2/60 px-3 text-left text-[14px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1">Buscar…</span>
      <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px]">Ctrl K</kbd>
    </button>
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
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-line bg-surface px-4 py-5 lg:flex">
        <BrandLockup />
        <SearchButton onOpen={openSearch} />
        <div className="-mt-2 flex-1 overflow-y-auto">
          <Navigation />
        </div>
        <UserCard />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <BrandLockup />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openSearch}
            className="rounded-md p-2 text-ink-2 hover:bg-surface-2"
            aria-label="Buscar"
          >
            <Search className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(true);
            }}
            className="rounded-md p-2 text-ink-2 hover:bg-surface-2"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

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
            className="absolute inset-0 bg-ink/40"
            onClick={() => {
              setMenuOpen(false);
            }}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(84vw,300px)] flex-col gap-6 bg-surface px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <BrandLockup />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                }}
                className="rounded-md p-2 text-ink-3 hover:bg-surface-2"
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

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1240px]">
          <Outlet />
        </div>
      </main>

      <SearchPalette
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
        }}
      />
    </div>
  );
}
