import records from "../data/bangaloreTrips.json";
import { haversineKm } from "./matching";

const TARGET = 36;
const MIN_KM = 2;
const KUDLU = [12.8917, 77.6414];

const PLACES = [
  ["Kudlu Gate", 12.8917, 77.6414],
  ["HSR Layout", 12.9121, 77.6446],
  ["Bommanahalli", 12.899, 77.6205],
  ["Silk Board", 12.9177, 77.6236],
  ["BTM Layout", 12.9166, 77.6101],
  ["Koramangala", 12.9352, 77.6245],
  ["Ejipura", 12.945, 77.628],
  ["Indiranagar", 12.9784, 77.6408],
  ["Domlur", 12.9609, 77.6387],
  ["HAL", 12.958, 77.665],
  ["Marathahalli", 12.9591, 77.6974],
  ["Bellandur", 12.926, 77.6762],
  ["Kasavanahalli", 12.907, 77.676],
  ["Sarjapur Road", 12.91, 77.687],
  ["Whitefield", 12.9698, 77.7499],
  ["KR Puram", 13.0075, 77.695],
  ["Electronic City", 12.8456, 77.6603],
  ["Bommasandra", 12.816, 77.69],
  ["Chandapura", 12.8012, 77.7114],
  ["Begur", 12.87, 77.632],
  ["Hongasandra", 12.898, 77.63],
  ["JP Nagar", 12.9063, 77.5857],
  ["Jayanagar", 12.9304, 77.5838],
  ["Banashankari", 12.9255, 77.5468],
  ["Kumaraswamy Layout", 12.9058, 77.5614],
  ["Uttarahalli", 12.9056, 77.5453],
  ["Kanakapura Road", 12.885, 77.545],
  ["Kengeri", 12.8994, 77.482],
  ["Rajarajeshwari Nagar", 12.9245, 77.5197],
  ["Nagarbhavi", 12.965, 77.51],
  ["Vijayanagar", 12.9719, 77.5336],
  ["Majestic", 12.9766, 77.5713],
  ["Malleshwaram", 13.0035, 77.5647],
  ["Yeshwanthpur", 13.028, 77.5409],
  ["Hebbal", 13.0358, 77.597],
  ["Yelahanka", 13.1007, 77.5963],
  ["RT Nagar", 13.02, 77.595],
  ["Kalyan Nagar", 13.028, 77.6395],
  ["MG Road", 12.9756, 77.605],
  ["Ulsoor", 12.9816, 77.6285],
  ["Shivajinagar", 12.9857, 77.6057],
  ["Rajajinagar", 12.9915, 77.552],
  ["Basavanagudi", 12.9422, 77.5754],
  ["Lalbagh", 12.9507, 77.5848],
  ["Bannerghatta Road", 12.8698, 77.597],
  ["Arekere", 12.8875, 77.597],
  ["Madiwala", 12.922, 77.617],
  ["CV Raman Nagar", 12.985, 77.664],
  ["Hoodi", 12.991, 77.716],
  ["Varthur", 12.94, 77.747],
  ["Peenya", 13.0285, 77.519],
];

const trips = records.map((row) => ({
  id: String(row[0]),
  minute: row[1],
  pickup: [row[2], row[3]],
  dropoff: [row[4], row[5]],
}));

function routeKey(trip) {
  const round = (value) => Number(value).toFixed(4);
  return `${round(trip.pickup[0])}|${round(trip.pickup[1])}|${round(trip.dropoff[0])}|${round(trip.dropoff[1])}`;
}

function uniqueRoutes() {
  const chosen = [];
  const seen = new Set();
  for (const trip of trips) {
    const key = routeKey(trip);
    if (seen.has(key)) continue;
    if ((haversineKm(trip.pickup, trip.dropoff) || 0) < MIN_KM) continue;
    seen.add(key);
    chosen.push(trip);
  }
  return chosen;
}

function closestToKudlu(pool) {
  let best = pool[0];
  let nearest = Infinity;
  for (const trip of pool) {
    const distance = haversineKm(trip.pickup, KUDLU);
    if (distance < nearest) {
      nearest = distance;
      best = trip;
    }
  }
  return best;
}

function spread(pool, already) {
  const picked = [...already];
  const used = new Set(picked.map((trip) => trip.id));
  while (picked.length < TARGET) {
    let next = null;
    let best = -1;
    for (const trip of pool) {
      if (used.has(trip.id)) continue;
      let minPickup = Infinity;
      let minDrop = Infinity;
      for (const have of picked) {
        const pickupGap = haversineKm(have.pickup, trip.pickup);
        const dropGap = haversineKm(have.dropoff, trip.dropoff);
        if (pickupGap < minPickup) minPickup = pickupGap;
        if (dropGap < minDrop) minDrop = dropGap;
      }
      const value = Math.min(minPickup, 8) + Math.min(minDrop, 8) * 0.75;
      if (value > best) {
        best = value;
        next = trip;
      }
    }
    if (!next || best < 1.5) break;
    picked.push(next);
    used.add(next.id);
  }
  return picked;
}

const pool = uniqueRoutes();
const reference = closestToKudlu(pool);
const selectedTrips = spread(pool, [reference]);

function line(start, end) {
  const count = 10;
  return Array.from({ length: count }, (_, step) => {
    const t = step / (count - 1);
    return [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];
  });
}

function place(point) {
  let name = "";
  let nearest = Infinity;
  for (const [label, lat, lng] of PLACES) {
    const distance = haversineKm(point, [lat, lng]);
    if (distance < nearest) {
      nearest = distance;
      name = label;
    }
  }
  const coords = `${point[0].toFixed(4)}, ${point[1].toFixed(4)}`;
  return nearest <= 2.5 ? `${name} (${coords})` : `Bengaluru ${coords}`;
}

function upcoming(minute) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return date.toISOString();
}

export const BANGALORE_TRIP_COUNT = trips.length;
export const BANGALORE_BOARD_COUNT = selectedTrips.length;
export const BANGALORE_NOTICE = `${BANGALORE_TRIP_COUNT.toLocaleString("en-IN")} real Bengaluru cab bookings are loaded, from weekday mornings and evenings in 2013 with recorded pickup and drop coordinates. This board shows ${BANGALORE_BOARD_COUNT} distinct routes. Dates are moved to tomorrow. These are not DSU students.`;

export function bangaloreBoardTrips(userId) {
  if (!userId) return [];
  return selectedTrips.map((trip) => {
    const mine = trip.id === reference.id;
    const distanceKm = haversineKm(trip.pickup, trip.dropoff) || 0;
    const seats = 1 + (Number(trip.id) % 3);
    return {
      id: `blr-${trip.id}`,
      user_id: mine ? userId : `blr-rider-${trip.id}`,
      owner_display_name: mine ? "Your Bengaluru test trip" : "Bengaluru cab booking",
      status: "open",
      seats_taken: 0,
      seats_available: Number.isFinite(seats) ? seats : 2,
      estimated_cost: 0,
      transport_mode: "Cab",
      departure_at: upcoming(trip.minute),
      origin_name: place(trip.pickup),
      destination_name: place(trip.dropoff),
      origin_lat: trip.pickup[0],
      origin_lng: trip.pickup[1],
      destination_lat: trip.dropoff[0],
      destination_lng: trip.dropoff[1],
      route_geometry: line(trip.pickup, trip.dropoff),
      distance_km: Number(distanceKm.toFixed(2)),
      duration_min: Math.max(8, Math.round((distanceKm / 22) * 60)),
      preferences: `Recorded Bengaluru booking ${trip.id}. The map line joins that pickup and drop.`,
      is_demo: true,
      is_bangalore: true,
    };
  });
}
