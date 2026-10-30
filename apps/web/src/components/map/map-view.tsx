import { MapPinOff } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useMapConfig } from '../../api/hooks';
import { Spinner } from '../ui';
import type { MapViewProps } from './types';

// Mapbox GL is large: it loads only on the screens that show a map.
const MapboxView = lazy(() => import('./mapbox-view'));

/** A Mapbox map with the token served by the API; a quiet notice when it is not configured. */
export function MapView(props: Omit<MapViewProps, 'center'> & { center?: MapViewProps['center'] }) {
  const config = useMapConfig();
  const height = props.className ?? 'h-[420px] w-full';
  if (config.isPending) {
    return (
      <div className={`${height} grid place-items-center bg-surface-2`}>
        <Spinner label="Cargando mapa…" />
      </div>
    );
  }
  if (!config.data?.token) {
    return (
      <div
        className={`${height} grid place-items-center bg-surface-2 px-6 text-center text-sm text-ink-2`}
      >
        <div className="flex flex-col items-center gap-2">
          <MapPinOff aria-hidden className="size-5 text-ink-3" />
          <p>El mapa no está disponible: falta configurar el token de Mapbox en el servidor.</p>
        </div>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className={`${height} grid place-items-center bg-surface-2`}>
          <Spinner label="Cargando mapa…" />
        </div>
      }
    >
      <MapboxView
        {...props}
        center={props.center ?? config.data.center}
        token={config.data.token}
      />
    </Suspense>
  );
}
