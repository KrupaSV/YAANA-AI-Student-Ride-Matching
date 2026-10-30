const EARTH_KM = 6371;

function radians(value) {
  return (value * Math.PI) / 180;
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const dLat = radians(b[0] - a[0]);
  const dLng = radians(b[1] - a[1]);
  const lat1 = radians(a[0]);
  const lat2 = radians(b[0]);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sampleRoute(route, count = 40) {
  if (!Array.isArray(route) || route.length < 2) return [];
  if (route.length <= count) return route;
  const step = (route.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => route[Math.round(index * step)]);
}

export function routeOverlapPercent(routeA, routeB, thresholdKm = 0.4) {
  const a = sampleRoute(routeA);
  const b = sampleRoute(routeB);
  if (a.length < 2 || b.length < 2) return null;

  const shareNear = (points, other) => {
    let hits = 0;
    for (const point of points) {
      let nearest = Infinity;
      for (const candidate of other) {
        const distance = haversineKm(point, candidate);
        if (distance < nearest) nearest = distance;
      }
      if (nearest <= thresholdKm) hits += 1;
    }
    return hits / points.length;
  };

  return Number((((shareNear(a, b) + shareNear(b, a)) / 2) * 100).toFixed(1));
}

export function simplifyRoute(route, maxPoints = 120) {
  return sampleRoute(route, maxPoints);
}

export function minutesApart(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

export function openSeats(trip) {
  return Math.max(0, Number(trip?.seats_available || 0) - Number(trip?.seats_taken || 0));
}

export const TRANSPORT_MODES = ["Auto", "Cab", "Carpool", "Bike", "Public transport"];
export const MAX_TIME_DIFFERENCE_MIN = 120;
export const OVERLAP_THRESHOLD_KM = 0.4;

export function explainMatch(reference, candidate) {
  const overlap = routeOverlapPercent(reference.route_geometry, candidate.route_geometry, OVERLAP_THRESHOLD_KM);
  const timeDifference = Number.isFinite(minutesApart(reference.departure_at, candidate.departure_at))
    ? Math.round(minutesApart(reference.departure_at, candidate.departure_at))
    : null;
  const destinationSeparation = haversineKm(
    [reference.destination_lat, reference.destination_lng],
    [candidate.destination_lat, candidate.destination_lng]
  );
  const comparable = Array.isArray(reference.route_geometry)
    && reference.route_geometry.length > 1
    && Array.isArray(candidate.route_geometry)
    && candidate.route_geometry.length > 1
    && Number.isFinite(Number(reference.distance_km));

  return {
    overlap,
    timeDifference,
    destinationSeparation: destinationSeparation == null ? null : Number(destinationSeparation.toFixed(2)),
    sameTransport: reference.transport_mode === candidate.transport_mode,
    roadDistanceKm: Number(reference.distance_km),
    openSeats: openSeats(candidate),
    comparable,
  };
}
