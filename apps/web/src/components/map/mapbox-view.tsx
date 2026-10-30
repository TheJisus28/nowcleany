import 'mapbox-gl/dist/mapbox-gl.css';
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapboxMap,
  Marker,
  NavigationControl,
  Popup,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { MapLink, MapMarker, MapViewProps } from './types';

const TONES: Record<MapMarker['tone'], string> = {
  brand: '#003858',
  good: '#0ca30c',
  warning: '#e09a00',
  critical: '#d03b3b',
  muted: '#71838e',
};

/** A pin (a place: a branch) or a dot (an event: a GPS check-in), always with a white ring. */
function markerElement(marker: MapMarker): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', marker.title);
  element.style.cursor = marker.onClick ? 'pointer' : 'default';
  element.style.background = 'transparent';
  element.style.border = '0';
  element.style.padding = '0';
  const color = TONES[marker.tone];
  if (marker.shape === 'dot') {
    element.innerHTML = `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px #fff,0 1px 3px rgb(15 31 42 / .35)"></span>`;
  } else {
    element.innerHTML = `<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33s11-11.2 11-20A11 11 0 0 0 2 13c0 8.8 11 20 11 20Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4.2" fill="#fff"/></svg>`;
  }
  return element;
}

function popupContent(marker: MapMarker): HTMLElement {
  const box = document.createElement('div');
  box.style.font = '13px/1.4 "Archivo Variable", system-ui, sans-serif';
  box.style.color = '#0f1f2a';
  const title = document.createElement('p');
  title.style.fontWeight = '600';
  title.textContent = marker.title;
  box.append(title);
  for (const line of marker.lines ?? []) {
    const p = document.createElement('p');
    p.style.color = '#475964';
    p.textContent = line;
    box.append(p);
  }
  return box;
}

function linksGeoJson(links: readonly MapLink[]) {
  return {
    type: 'FeatureCollection' as const,
    features: links.map((link) => ({
      type: 'Feature' as const,
      properties: { color: TONES[link.tone] },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [link.from.longitude, link.from.latitude],
          [link.to.longitude, link.to.latitude],
        ],
      },
    })),
  };
}

export default function MapboxView({
  token,
  center,
  markers,
  links = [],
  zoom = 12,
  fit = true,
  focus,
  onMapClick,
  className,
  label,
}: MapViewProps & { token: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const ready = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapboxMap({
      container: container.current,
      accessToken: token,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [center.longitude, center.latitude],
      zoom,
      language: 'es',
      cooperativeGestures: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (event) => {
      clickRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });
    ready.current = new Promise((resolve) => {
      map.on('load', () => {
        map.addSource('links', { type: 'geojson', data: linksGeoJson([]) });
        map.addLayer({
          id: 'links',
          type: 'line',
          source: 'links',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-dasharray': [2, 1.5],
            'line-opacity': 0.8,
          },
        });
        resolve();
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once per token; markers and links update below.
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markerRefs.current) marker.remove();
    markerRefs.current = markers.map((item) => {
      const element = markerElement(item);
      const popup = new Popup({ offset: item.shape === 'dot' ? 10 : 28, closeButton: false });
      popup.setDOMContent(popupContent(item));
      const marker = new Marker({
        element,
        anchor: item.shape === 'dot' ? 'center' : 'bottom',
        draggable: Boolean(item.onDrag),
      })
        .setLngLat([item.longitude, item.latitude])
        .setPopup(popup)
        .addTo(map);
      element.addEventListener('mouseenter', () => {
        if (!popup.isOpen()) marker.togglePopup();
      });
      element.addEventListener('mouseleave', () => {
        if (popup.isOpen()) marker.togglePopup();
      });
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        item.onClick?.();
      });
      if (item.onDrag) {
        const onDrag = item.onDrag;
        marker.on('dragend', () => {
          const position = marker.getLngLat();
          onDrag({ latitude: position.lat, longitude: position.lng });
        });
      }
      return marker;
    });
    if (fit && markers.length > 0) {
      const bounds = new LngLatBounds();
      for (const item of markers) bounds.extend([item.longitude, item.latitude]);
      for (const link of links) {
        bounds.extend([link.from.longitude, link.from.latitude]);
        bounds.extend([link.to.longitude, link.to.latitude]);
      }
      map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
    }
  }, [markers, links, fit]);

  useEffect(() => {
    void ready.current?.then(() => {
      const source = mapRef.current?.getSource<GeoJSONSource>('links');
      source?.setData(linksGeoJson(links));
    });
  }, [links]);

  const focusLat = focus?.latitude;
  const focusLng = focus?.longitude;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusLat === undefined || focusLng === undefined) return;
    map.easeTo({ center: [focusLng, focusLat], zoom: Math.max(map.getZoom(), 15), duration: 400 });
  }, [focusLat, focusLng]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={className ?? 'h-[420px] w-full'}
    />
  );
}
