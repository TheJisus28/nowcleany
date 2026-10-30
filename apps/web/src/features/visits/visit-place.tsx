import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import type { Visit } from '../../api/types';
import { Chip } from '../../components/status';

/** "35 m" / "1,2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${String(Math.round(meters))} m`;
  return `${(meters / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
}

/** Whether the seller was physically at the branch: status with icon and words, never color alone. */
export function VisitPlaceChip({ visit }: { visit: Pick<Visit, 'onSite' | 'distanceM'> }) {
  if (visit.onSite === null || visit.distanceM === null) {
    return (
      <Chip tone="neutral" icon={CircleHelp}>
        Sucursal sin ubicar
      </Chip>
    );
  }
  return visit.onSite ? (
    <Chip tone="good" icon={CircleCheck}>
      {`En sitio · ${formatDistance(visit.distanceM)}`}
    </Chip>
  ) : (
    <Chip tone="warning" icon={TriangleAlert}>
      {`Lejos · a ${formatDistance(visit.distanceM)}`}
    </Chip>
  );
}
