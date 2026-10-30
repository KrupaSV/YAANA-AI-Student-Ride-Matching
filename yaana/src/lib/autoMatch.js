import { haversineKm, minutesApart, openSeats, routeOverlapPercent } from "./matching.js";

export const MATCH_CONFIG = {
  sameDateRequired: true,
  maxTimeDifferenceMin: 30,
  maxPickupKm: 5,
  maxDestinationKm: 2.5,
  minRouteOverlapPct: 20,
  overlapProximityKm: 0.4,
  minScore: 55,
  weights: {
    route: 35,
    destination: 25,
    pickup: 20,
    time: 15,
    transport: 5,
  },
};

export function travelDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function transportCompatible(a, b) {
  return Boolean(a) && a === b;
}

export function orderedTripIds(idA, idB) {
  return String(idA) < String(idB) ? [idA, idB] : [idB, idA];
}

export function nextMatchStatus(responseA, responseB) {
  if (responseA === "rejected" || responseB === "rejected") return "rejected";
  if (responseA === "accepted" && responseB === "accepted") return "confirmed";
  return "pending";
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function proximityScore(km, maxKm) {
  if (!Number.isFinite(km) || km > maxKm) return 0;
  return clamp01(1 - km / maxKm);
}

function timeScore(minutes, maxMinutes) {
  if (!Number.isFinite(minutes) || minutes > maxMinutes) return 0;
  return clamp01(1 - minutes / maxMinutes);
}

function asPoint(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

export function evaluatePair(tripA, tripB, config = MATCH_CONFIG) {
  const reasons = [];
  if (!tripA || !tripB || tripA.id === tripB.id) {
    return { compatible: false, score: 0, reasons: ["A match needs two different trips."], breakdown: {} };
  }
  if (tripA.user_id && tripB.user_id && tripA.user_id === tripB.user_id) {
    return { compatible: false, score: 0, reasons: ["A student cannot match with their own trip."], breakdown: {} };
  }
  if (tripA.status !== "open" || tripB.status !== "open") {
    reasons.push("Only open published trips can match.");
  }
  const seatsA = openSeats(tripA);
  const seatsB = openSeats(tripB);
  if (seatsA < 1 || seatsB < 1) {
    reasons.push("Both trips need at least one open seat.");
  }
  if (config.sameDateRequired && travelDateKey(tripA.departure_at) !== travelDateKey(tripB.departure_at)) {
    reasons.push("The trips are not on the same travel date.");
  }
  const timeDifference = Number.isFinite(minutesApart(tripA.departure_at, tripB.departure_at))
    ? Math.round(minutesApart(tripA.departure_at, tripB.departure_at))
    : null;
  if (timeDifference == null || timeDifference > config.maxTimeDifferenceMin) {
    reasons.push(`Departure times are more than ${config.maxTimeDifferenceMin} minutes apart.`);
  }
  const sameTransport = transportCompatible(tripA.transport_mode, tripB.transport_mode);
  if (!sameTransport) {
    reasons.push("The transport modes are not compatible.");
  }

  const pickupKm = haversineKm(
    asPoint(tripA.origin_lat, tripA.origin_lng),
    asPoint(tripB.origin_lat, tripB.origin_lng),
  );
  const destinationKm = haversineKm(
    asPoint(tripA.destination_lat, tripA.destination_lng),
    asPoint(tripB.destination_lat, tripB.destination_lng),
  );
  const overlap = routeOverlapPercent(
    tripA.route_geometry,
    tripB.route_geometry,
    config.overlapProximityKm,
  );

  const corridorOk = overlap != null && overlap >= 70;
  const destOk = (Number.isFinite(destinationKm) && destinationKm <= config.maxDestinationKm) || corridorOk;
  const pickupOk = (Number.isFinite(pickupKm) && pickupKm <= config.maxPickupKm) || corridorOk;
  if (!destOk) {
    reasons.push("The destinations are too far apart and the saved routes do not overlap enough.");
  }
  if (!pickupOk) {
    reasons.push("The pickups are too far apart and the saved routes do not overlap enough.");
  }

  const destComponent = proximityScore(destinationKm, config.maxDestinationKm);
  const pickupComponent = proximityScore(pickupKm, config.maxPickupKm);
  const timeComponent = timeScore(timeDifference, config.maxTimeDifferenceMin);
  const routeComponent = overlap == null
    ? (destComponent + pickupComponent) / 2
    : clamp01(overlap / 100);
  const transportComponent = sameTransport ? 1 : 0;

  const score = Math.round(
    routeComponent * config.weights.route
    + destComponent * config.weights.destination
    + pickupComponent * config.weights.pickup
    + timeComponent * config.weights.time
    + transportComponent * config.weights.transport,
  );

  const compatible = reasons.length === 0 && destOk && pickupOk && score >= config.minScore;

  if (reasons.length === 0 && !compatible) {
    reasons.push("The compatibility score is below the matching threshold.");
  }

  return {
    compatible,
    score,
    reasons,
    pickupKm: pickupKm == null ? null : Number(pickupKm.toFixed(2)),
    destinationKm: destinationKm == null ? null : Number(destinationKm.toFixed(2)),
    overlapPct: overlap,
    timeDifferenceMin: timeDifference,
    sameTransport,
    breakdown: {
      route: Math.round(routeComponent * config.weights.route),
      destination: Math.round(destComponent * config.weights.destination),
      pickup: Math.round(pickupComponent * config.weights.pickup),
      time: Math.round(timeComponent * config.weights.time),
      transport: Math.round(transportComponent * config.weights.transport),
    },
  };
}

export function shouldCreateMatch(existing, evaluation) {
  if (!evaluation?.compatible) return false;
  if (!existing) return true;
  return false;
}

export function pairPayload(tripA, tripB, evaluation) {
  const [firstId, secondId] = orderedTripIds(tripA.id, tripB.id);
  const first = firstId === tripA.id ? tripA : tripB;
  const second = firstId === tripA.id ? tripB : tripA;
  return {
    trip_a_id: first.id,
    trip_b_id: second.id,
    user_a_id: first.user_id,
    user_b_id: second.user_id,
    score: evaluation.score,
    score_breakdown: evaluation.breakdown,
    overlap_pct: evaluation.overlapPct,
    pickup_km: evaluation.pickupKm,
    destination_km: evaluation.destinationKm,
    time_difference_min: evaluation.timeDifferenceMin,
    status: "pending",
    response_a: "pending",
    response_b: "pending",
  };
}
