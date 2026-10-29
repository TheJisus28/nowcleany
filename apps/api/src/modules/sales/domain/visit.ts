/** A check-in within this distance of the branch counts as an in-person visit. */
export const ON_SITE_METERS = 150;

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two points (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

/**
 * Whether the seller was at the branch: close enough, allowing for the GPS accuracy reported by the
 * phone. Unknown when the branch has no location.
 */
export function onSite(distance: number | null, accuracy: number | null): boolean | null {
  if (distance === null) return null;
  return distance <= ON_SITE_METERS + Math.min(accuracy ?? 0, 100);
}
