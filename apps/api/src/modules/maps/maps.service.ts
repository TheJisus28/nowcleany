import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../platform/config/app-config.js';
import { ValidationError } from '../../shared-kernel/index.js';

export interface MapConfig {
  /** Mapbox public token (pk.*) for the browser map; null when not configured. */
  readonly token: string | null;
  readonly center: { latitude: number; longitude: number };
}

export interface Place {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** Montería: where the map opens and the search looks first. */
const MONTERIA = { latitude: 8.7479, longitude: -75.8814 };

interface MapboxFeature {
  properties?: { full_address?: string; name?: string; place_formatted?: string };
  geometry?: { coordinates?: [number, number] };
}

/** Mapbox: the public token for the panel's map and address search (geocoding) from the server. */
@Injectable()
export class MapsService {
  private readonly logger = new Logger('maps');

  constructor(private readonly config: AppConfig) {}

  mapConfig(): MapConfig {
    return { token: this.config.optional('MAPBOX_PUBLIC_TOKEN'), center: MONTERIA };
  }

  async geocode(query: string): Promise<Place[]> {
    const text = query.trim();
    if (text.length < 3) return [];
    const token =
      this.config.optional('MAPBOX_GEOCODING_TOKEN') ?? this.config.optional('MAPBOX_PUBLIC_TOKEN');
    if (!token) {
      throw new ValidationError(
        'maps.not_configured',
        'La búsqueda de direcciones no está configurada (falta el token de Mapbox).',
      );
    }
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', text);
    url.searchParams.set('country', 'co');
    url.searchParams.set('language', 'es');
    url.searchParams.set('limit', '6');
    url.searchParams.set('proximity', `${String(MONTERIA.longitude)},${String(MONTERIA.latitude)}`);
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      this.logger.warn(`Mapbox respondió ${String(response.status)} a una búsqueda de dirección`);
      return [];
    }
    const body = (await response.json()) as { features?: MapboxFeature[] };
    return (body.features ?? []).flatMap((feature) => {
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];
      if (latitude === undefined || longitude === undefined) return [];
      const label =
        feature.properties?.full_address ??
        [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ');
      return [{ label, latitude, longitude }];
    });
  }
}
