import { haversineKm } from "./matching.js";

const METERS_PER_DEGREE = 111_195;
const MAX_SEGMENT_METERS = 55;
const ROAD_TOLERANCE_METERS = 60;
const MIN_SHARED_METERS = 110;
const MAX_PICKUP_GAP_KM = 0.6;

function location(lat, lng) {
  if (lat == null || lat === "" || lng == null || lng === "") return null;
  const point = [Number(lat), Number(lng)];
  return Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180 ? point : null;
}

function savedRoute(trip) {
  if (!Array.isArray(trip?.route_geometry) || trip.route_geometry.length < 2) return [];
  const points = trip.route_geometry.map((point) => Array.isArray(point)
    ? location(point[0], point[1])
    : location(point?.lat, point?.lng));
  return points.every(Boolean) && points.some(([lat, lng]) => lat !== points[0][0] || lng !== points[0][1])
    ? points
    : [];
}

function roadSegments(route, project) {
  const projected = route.map(project);
  const segments = [];
  for (let index = 1; index < projected.length; index++) {
    const [x, y] = projected[index - 1];
    const [endX, endY] = projected[index];
    const length = Math.hypot(endX - x, endY - y);
    if (length === 0) continue;
    segments.push({
      x,
      y,
      length,
      dx: (endX - x) / length,
      dy: (endY - y) / length,
      start: route[index - 1],
      end: route[index],
    });
  }
  return segments;
}

function sameRoad(x, y, segment, other) {
  const offsetX = x - other.x;
  const offsetY = y - other.y;
  const along = offsetX * other.dx + offsetY * other.dy;
  if (along < 0 || along > other.length) return false;
  const across = Math.abs(offsetX * other.dy - offsetY * other.dx);
  return across <= ROAD_TOLERANCE_METERS && segment.dx * other.dx + segment.dy * other.dy >= 0.8;
}

function interpolate([lat, lng], [endLat, endLng], fraction) {
  return [lat + (endLat - lat) * fraction, lng + (endLng - lng) * fraction];
}

function sharedRoad(ownRoute, peerRoute) {
  const [lat, lng] = ownRoute[0];
  const lngScale = METERS_PER_DEGREE * Math.cos(lat * Math.PI / 180);
  const project = ([pointLat, pointLng]) => [
    (pointLng - lng) * lngScale,
    (pointLat - lat) * METERS_PER_DEGREE,
  ];
  const peerSegments = roadSegments(peerRoute, project);
  const stretches = [];
  let points = [];
  let meters = 0;

  function finishStretch() {
    if (meters >= MIN_SHARED_METERS) stretches.push({ points, meters });
    points = [];
    meters = 0;
  }

  for (const segment of roadSegments(ownRoute, project)) {
    // Limit the highlighted area near joins without straightening bends in the saved route.
    const steps = Math.ceil(segment.length / MAX_SEGMENT_METERS);
    const step = segment.length / steps;
    for (let index = 0; index < steps; index++) {
      const midpoint = (index + 0.5) * step;
      const x = segment.x + segment.dx * midpoint;
      const y = segment.y + segment.dy * midpoint;
      if (!peerSegments.some((other) => sameRoad(x, y, segment, other))) {
        if (points.length) finishStretch();
        continue;
      }
      if (!points.length) points.push(interpolate(segment.start, segment.end, index / steps));
      points.push(interpolate(segment.start, segment.end, (index + 1) / steps));
      meters += step;
    }
  }

  finishStretch();
  return stretches;
}

function proposePickup(stretches, own, peer) {
  const ownPickup = location(own?.origin_lat, own?.origin_lng);
  const peerPickup = location(peer?.origin_lat, peer?.origin_lng);
  if (!ownPickup || !peerPickup) return null;

  for (const { points: [position] } of stretches) {
    const ownGap = haversineKm(ownPickup, position);
    const peerGap = haversineKm(peerPickup, position);
    if (Math.max(ownGap, peerGap) > MAX_PICKUP_GAP_KM) continue;
    const [nearestGap, name] = ownGap <= peerGap ? [ownGap, own.origin_name] : [peerGap, peer.origin_name];
    const label = name && nearestGap <= 0.12 ? `Near ${name}` : "Start of the shared stretch";
    return { position, label };
  }
  return null;
}

export function compareMatchRoutes(own, peer) {
  const ownRoute = savedRoute(own);
  const peerRoute = savedRoute(peer);
  // Anchor the shared stretch and pickup to the same trip for both students.
  const peerFirst = own?.id && peer?.id && peer.id < own.id;
  const stretches = ownRoute.length && peerRoute.length
    ? (peerFirst ? sharedRoad(peerRoute, ownRoute) : sharedRoad(ownRoute, peerRoute))
    : [];
  return {
    ownRoute,
    peerRoute,
    shared: stretches.map(({ points }) => points),
    sharedMeters: stretches.reduce((total, { meters }) => total + meters, 0),
    pickup: peerFirst ? proposePickup(stretches, peer, own) : proposePickup(stretches, own, peer),
  };
}
