import { LayoutGrid, X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { cn } from '../ui';

interface WorkTab {
  path: string;
  title: string;
}

interface WorkTabsApi {
  tabs: readonly WorkTab[];
  setTitle: (path: string, title: string) => void;
  close: (path: string) => void;
}

const STORAGE = 'scip.work-tabs';
/** The empty desk: where the user lands after closing every tab. It never becomes a tab. */
export const EMPTY_DESK = '/escritorio';
const MAX_TABS = 10;
const Context = createContext<WorkTabsApi | null>(null);

function load(): WorkTab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as WorkTab[]) : [];
  } catch {
    return [];
  }
}

/**
 * The work tabs of traditional systems: every screen the user opens stays as a tab so they can jump
 * between tasks (stock while filling a purchase order) and come back. Drafts keep what was typed.
 */
export function WorkTabsProvider({
  children,
  titleFor,
}: {
  children: ReactNode;
  /** Default title of a path (the menu entry), until the page names itself. */
  titleFor: (path: string) => string;
}) {
  const location = useLocation();
  const [tabs, setTabs] = useState<WorkTab[]>(load);
  const path = location.pathname + location.search;

  useEffect(() => {
    if (location.pathname === EMPTY_DESK) return;
    setTabs((current) => {
      if (current.some((tab) => tab.path === path)) return current;
      // Same screen with other filters replaces its tab instead of piling up.
      const base = location.pathname;
      const without = current.filter((tab) => tab.path.split('?')[0] !== base);
      return [...without, { path, title: titleFor(location.pathname) }].slice(-MAX_TABS);
    });
  }, [path, location.pathname, titleFor]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(tabs));
    } catch {
      // Private mode: tabs last until reload.
    }
  }, [tabs]);

  const setTitle = useCallback((tabPath: string, title: string) => {
    setTabs((current) =>
      current.some((tab) => tab.path.split('?')[0] === tabPath && tab.title !== title)
        ? current.map((tab) => (tab.path.split('?')[0] === tabPath ? { ...tab, title } : tab))
        : current,
    );
  }, []);
  const close = useCallback((tabPath: string) => {
    setTabs((current) => current.filter((tab) => tab.path !== tabPath));
  }, []);
  const api = useMemo(() => ({ tabs, setTitle, close }), [tabs, setTitle, close]);
  return <Context.Provider value={api}>{children}</Context.Provider>;
}

/** Names the current screen's tab ("PV-00031 · La Economía"). */
export function useWorkTab(title: string | undefined): void {
  const setTitle = useContext(Context)?.setTitle;
  const location = useLocation();
  useEffect(() => {
    if (setTitle && title) setTitle(location.pathname, title);
  }, [setTitle, title, location.pathname]);
}

export function WorkTabsBar() {
  const api = useContext(Context);
  const location = useLocation();
  const navigate = useNavigate();
  if (!api || api.tabs.length === 0) return <span className="flex-1" />;
  const current = location.pathname + location.search;
  const closeTab = (path: string) => {
    const index = api.tabs.findIndex((tab) => tab.path === path);
    api.close(path);
    const remaining = api.tabs.filter((tab) => tab.path !== path);
    if (remaining.length === 0) {
      void navigate(EMPTY_DESK);
    } else if (path === current) {
      const neighbor = api.tabs[index + 1] ?? api.tabs[index - 1];
      if (neighbor) void navigate(neighbor.path);
    }
  };
  return (
    <nav
      aria-label="Pestañas de trabajo"
      className="no-print flex min-w-0 flex-1 gap-0.5 self-stretch overflow-x-auto"
    >
      {api.tabs.map((tab) => {
        const active = tab.path === current;
        return (
          <span
            key={tab.path}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                closeTab(tab.path);
              }
            }}
            className={cn(
              'group flex shrink-0 items-center gap-1 self-end rounded-t-md border border-b-0 pr-1 text-[13px]',
              active
                ? 'border-line bg-surface font-medium text-ink'
                : 'border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Link to={tab.path} className="max-w-56 truncate py-2 pl-3" title={tab.title}>
              {tab.title}
            </Link>
            <button
              type="button"
              onClick={() => {
                closeTab(tab.path);
              }}
              className="rounded p-0.5 text-ink-3 opacity-60 hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
              aria-label={`Cerrar ${tab.title}`}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        );
      })}
    </nav>
  );
}

/** No screen open: a blank desk until the user opens something from the menu. */
export function EmptyDesk() {
  return (
    <div aria-label="Sin pantallas abiertas" className="grid min-h-[60vh] place-items-center">
      <LayoutGrid aria-hidden className="size-16 text-line-strong" strokeWidth={1.25} />
    </div>
  );
}
