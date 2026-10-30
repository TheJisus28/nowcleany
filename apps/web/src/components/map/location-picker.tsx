import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Place } from '../../api/types';
import { Button, Input } from '../ui';
import { MapView } from './map-view';
import type { LatLng } from './types';

/**
 * Where a branch is: search an address (Mapbox geocoding through the API), click the map or drag the
 * pin. The location is optional; without it a visit cannot tell whether the seller was there.
 */
export function LocationPicker({
  value,
  onChange,
  initialQuery = '',
}: {
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 4) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      api
        .get<Place[]>(`/v1/maps/geocode?q=${encodeURIComponent(text)}`)
        .then(setResults)
        .catch((reason: unknown) => {
          setError(errorMessage(reason));
        })
        .finally(() => {
          setSearching(false);
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  const markers = useMemo(
    () =>
      value
        ? [
            {
              id: 'branch',
              tone: 'brand' as const,
              title: 'Ubicación de la sucursal',
              lines: ['Arrastra el pin para ajustarla'],
              latitude: value.latitude,
              longitude: value.longitude,
              onDrag: onChange,
            },
          ]
        : [],
    [value, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Busca la dirección: Calle 41 # 6-20, Montería"
          className="pl-9"
          aria-label="Buscar dirección"
        />
        {results.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
            {results.map((place) => (
              <li key={`${String(place.latitude)},${String(place.longitude)}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ latitude: place.latitude, longitude: place.longitude });
                    setResults([]);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {searching ? <p className="text-[13px] text-ink-3">Buscando direcciones…</p> : null}
      {error ? <p className="text-[13px] text-critical">{error}</p> : null}
      <div className="overflow-hidden rounded-md border border-line">
        <MapView
          label="Mapa para ubicar la sucursal"
          className="h-64 w-full"
          markers={markers}
          fit={false}
          focus={value}
          zoom={value ? 15 : 12}
          {...(value ? { center: value } : {})}
          onMapClick={onChange}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <LocateFixed aria-hidden className="size-3.5 text-ink-3" />
          {value
            ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : 'Sin ubicación: haz clic en el mapa o busca la dirección.'}
        </span>
        {value ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="size-3.5" />}
            onClick={() => {
              onChange(null);
            }}
          >
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
