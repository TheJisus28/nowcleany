export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapMarker extends LatLng {
  id: string;
  /** brand: a place; good / warning: on site or far (status, always explained beside the map). */
  tone: 'brand' | 'good' | 'warning' | 'critical' | 'muted';
  shape?: 'pin' | 'dot';
  title: string;
  lines?: readonly string[];
  onClick?: () => void;
  /** Makes the marker draggable (location pickers). */
  onDrag?: (position: LatLng) => void;
}

/** A dashed line between two points: where the seller checked in and the branch. */
export interface MapLink {
  from: LatLng;
  to: LatLng;
  tone: MapMarker['tone'];
}

export interface MapViewProps {
  center: LatLng;
  markers: readonly MapMarker[];
  links?: readonly MapLink[];
  zoom?: number;
  /** Fits the view to the markers whenever they change. */
  fit?: boolean;
  /** Moves the camera to this point whenever it changes. */
  focus?: LatLng | null | undefined;
  onMapClick?: (position: LatLng) => void;
  className?: string;
  label: string;
}
