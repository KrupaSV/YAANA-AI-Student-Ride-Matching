import records from "../data/chicagoTrips.json";
import { haversineKm } from "./matching";

const TRIP_COUNT = 7619;

const PLACES = [
  ["The Loop", 41.8781, -87.6298],
  ["West Loop", 41.8826, -87.6445],
  ["South Loop", 41.8565, -87.6246],
  ["River North", 41.8924, -87.634],
  ["Streeterville", 41.8925, -87.6189],
  ["Gold Coast", 41.9058, -87.6273],
  ["Old Town", 41.9105, -87.637],
  ["Lincoln Park", 41.9214, -87.6513],
  ["Lakeview", 41.943, -87.654],
  ["Wrigleyville", 41.9484, -87.656],
  ["Uptown", 41.9665, -87.6533],
  ["Andersonville", 41.9796, -87.669],
  ["Edgewater", 41.9834, -87.6638],
  ["Rogers Park", 42.0096, -87.6694],
  ["Lincoln Square", 41.968, -87.688],
  ["Ravenswood", 41.965, -87.675],
  ["North Center", 41.956, -87.679],
  ["Logan Square", 41.9231, -87.7093],
  ["Wicker Park", 41.9088, -87.6796],
  ["Bucktown", 41.9227, -87.682],
  ["Humboldt Park", 41.9016, -87.7218],
  ["Ukrainian Village", 41.8967, -87.684],
  ["West Town", 41.893, -87.67],
  ["Near West Side", 41.881, -87.666],
  ["United Center", 41.8807, -87.6742],
  ["Pilsen", 41.856, -87.656],
  ["Chinatown", 41.8517, -87.632],
  ["Bridgeport", 41.837, -87.651],
  ["Little Village", 41.844, -87.705],
  ["Hyde Park", 41.7943, -87.5907],
  ["Kenwood", 41.809, -87.593],
  ["Bronzeville", 41.825, -87.617],
  ["Washington Park", 41.792, -87.616],
  ["Woodlawn", 41.78, -87.596],
  ["South Shore", 41.7606, -87.574],
  ["Englewood", 41.7798, -87.6454],
  ["Midway", 41.7868, -87.7522],
  ["Garfield Ridge", 41.803, -87.764],
  ["Austin", 41.8878, -87.7649],
  ["Oak Park", 41.885, -87.7845],
  ["Irving Park", 41.9534, -87.7292],
  ["Albany Park", 41.971, -87.7163],
  ["Portage Park", 41.954, -87.765],
  ["Jefferson Park", 41.9703, -87.7604],
  ["Dunning", 41.9474, -87.8067],
  ["Norwood Park", 41.9856, -87.8065],
  ["Edison Park", 42.0056, -87.8173],
  ["O'Hare", 41.9742, -87.9073],
  ["Belmont Cragin", 41.9317, -87.7687],
  ["Avondale", 41.939, -87.7112],
  ["Beverly", 41.717, -87.672],
  ["Morgan Park", 41.69, -87.666],
  ["Chatham", 41.741, -87.612],
  ["Auburn Gresham", 41.743, -87.656],
  ["Pullman", 41.692, -87.606],
  ["South Chicago", 41.739, -87.554],
  ["Hegewisch", 41.6536, -87.546],
];

const trips = records.map((row) => ({
  id: String(row[0]),
  minute: row[1],
  pickup: [row[2], row[3]],
  dropoff: [row[4], row[5]],
  miles: Number(row[6]),
}));

const referenceId = trips[0]?.id;

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
  return nearest <= 2.5 ? `${name} (${coords})` : `Chicago ${coords}`;
}

function upcoming(minute) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return date.toISOString();
}

function seatsFor(id) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return 1 + (sum % 3);
}

export function searchChicagoPlaces(query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 3) return [];
  return PLACES
    .filter(([name]) => name.toLowerCase().includes(q))
    .slice(0, 6)
    .map(([label, lat, lng]) => ({ label, lat, lng }));
}

export const CHICAGO_TRIP_COUNT = TRIP_COUNT;
export const CHICAGO_BOARD_COUNT = trips.length;
export const CHICAGO_NOTICE = `${CHICAGO_TRIP_COUNT.toLocaleString("en-IN")} real Chicago rideshare trips are loaded, from the City of Chicago open data for 25 October 2019, 4:00–5:15 pm. This board shows ${CHICAGO_BOARD_COUNT} distinct routes. Dates are moved to tomorrow. These are not DSU students.`;

export function chicagoBoardTrips(userId) {
  if (!userId) return [];
  return trips.map((trip) => {
    const mine = trip.id === referenceId;
    const recordedKm = Number.isFinite(trip.miles) ? trip.miles * 1.60934 : haversineKm(trip.pickup, trip.dropoff) || 0;
    return {
      id: `chi-${trip.id}`,
      user_id: mine ? userId : `chi-rider-${trip.id}`,
      owner_display_name: mine ? "Your Chicago test trip" : "Chicago rideshare trip",
      status: "open",
      seats_taken: 0,
      seats_available: seatsFor(trip.id),
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
      distance_km: Number(recordedKm.toFixed(2)),
      duration_min: Math.max(8, Math.round((trip.miles / 15) * 60)),
      preferences: `Recorded Chicago rideshare trip ${trip.id}. The map line joins that pickup and drop.`,
      is_demo: true,
      is_chicago: true,
    };
  });
}
