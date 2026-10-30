import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../dialog';
import { cn } from '../ui';

export interface LookupItem {
  id: string;
  /** Code, NIT or number the user types. */
  code: string;
  label: string;
  detail?: string;
}

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Exact code first, then items whose code or name contains every typed word. */
export function filterLookup(items: readonly LookupItem[], query: string): LookupItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  const exact = items.filter((item) => normalize(item.code) === words.join(' '));
  const rest = items.filter(
    (item) =>
      !exact.includes(item) &&
      words.every((word) =>
        normalize(`${item.code} ${item.label} ${item.detail ?? ''}`).includes(word),
      ),
  );
  return [...exact, ...rest];
}

/**
 * The F2 search of traditional systems: type part of the code or the name, move with the arrows,
 * Enter picks it.
 */
export function LookupDialog({
  open,
  title,
  items,
  initialQuery = '',
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  items: readonly LookupItem[];
  initialQuery?: string;
  onPick: (item: LookupItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterLookup(items, query).slice(0, 80), [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActive(0);
    window.setTimeout(() => input.current?.focus(), 0);
  }, [open, initialQuery]);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <input
            ref={input}
            value={query}
            className="h-10 w-full rounded-md border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink focus-visible:border-brand"
            aria-label="Buscar"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const item = results[active];
                if (item) onPick(item);
              }
            }}
          />
        </div>
        <ul
          className="max-h-80 overflow-y-auto rounded-md border border-line"
          role="listbox"
          aria-label={title}
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-3">Sin resultados</li>
          ) : (
            results.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => {
                    setActive(index);
                  }}
                  onClick={() => {
                    onPick(item);
                  }}
                  className={cn(
                    'grid w-full grid-cols-[120px_1fr] gap-3 px-3 py-1.5 text-left text-[13.5px]',
                    index === active ? 'bg-brand text-white' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="truncate tabular-nums">{item.code}</span>
                  <span className="truncate">
                    {item.label}
                    {item.detail ? (
                      <span className={index === active ? 'text-white/75' : 'text-ink-3'}>
                        {' '}
                        · {item.detail}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  );
}

/**
 * A field that holds a record (customer, supplier…): one box where the user types the code, NIT or
 * name and picks from the list that opens below (arrows and Enter). F2 opens the full search.
 */
export function LookupField({
  id,
  title,
  items,
  value,
  onChange,
  disabled = false,
  placeholder = 'Buscar por código, NIT o nombre',
}: {
  id?: string;
  title: string;
  items: readonly LookupItem[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  const display = selected ? `${selected.code} · ${selected.label}` : '';
  const [text, setText] = useState(display);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const results = useMemo(
    () => (listOpen ? filterLookup(items, text).slice(0, 50) : []),
    [items, text, listOpen],
  );
  useEffect(() => {
    setText(display);
  }, [display]);

  const pick = (item: LookupItem) => {
    onChange(item.id);
    setText(`${item.code} · ${item.label}`);
    setListOpen(false);
  };
  const listId = id ? `${id}-list` : undefined;

  return (
    <div className="relative min-w-0">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-3"
      />
      <input
        id={id}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        title={display || undefined}
        className="h-8 w-full rounded-[5px] border border-line-strong bg-surface pr-2 pl-7 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-brand disabled:bg-surface-2"
        onFocus={(event) => {
          event.target.select();
        }}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setListOpen(true);
        }}
        onBlur={() => {
          setListOpen(false);
          setText(display);
        }}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            setDialogOpen(true);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!listOpen) setListOpen(true);
            else setActive((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && listOpen) {
            event.preventDefault();
            const item = results[active];
            if (item) pick(item);
          } else if (event.key === 'Escape' && listOpen) {
            // Closes the list only, not the screen.
            event.stopPropagation();
            setListOpen(false);
            setText(display);
          }
        }}
      />
      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={title}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-line-strong bg-surface py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-center text-[13px] text-ink-3">Sin resultados</li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  // Keeps the focus in the box so the pick happens before the blur.
                  event.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                className={cn(
                  'grid cursor-pointer grid-cols-[110px_1fr] gap-3 px-3 py-1.5 text-[13.5px]',
                  index === active ? 'bg-brand text-white' : 'text-ink',
                )}
              >
                <span className="truncate tabular-nums">{item.code}</span>
                <span className="truncate">
                  {item.label}
                  {item.detail ? (
                    <span className={index === active ? 'text-white/75' : 'text-ink-3'}>
                      {' '}
                      · {item.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
      <LookupDialog
        open={dialogOpen}
        title={title}
        items={items}
        initialQuery={text === display ? '' : text}
        onPick={(item) => {
          pick(item);
          setDialogOpen(false);
        }}
        onClose={() => {
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
