import { chicagoBoardTrips, CHICAGO_NOTICE } from "./chicagoBoard";

const STORAGE_KEY = "yaana-demo-state";

export { CHICAGO_NOTICE };

function isBoardId(id) {
  return String(id || "").startsWith("chi-");
}

function emptyState() {
  return {
    seededFor: "",
    requests: [],
    notifications: [],
    cancelledTripIds: [],
    tripOverrides: {},
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    const state = parsed && typeof parsed === "object" ? { ...emptyState(), ...parsed } : emptyState();
    const requests = (state.requests || []).filter((row) => isBoardId(row.trip_id));
    const kept = new Set(requests.map((row) => row.id));
    state.requests = requests;
    state.notifications = (state.notifications || []).filter((row) => !row.related_id || kept.has(row.related_id));
    state.cancelledTripIds = (state.cancelledTripIds || []).filter(isBoardId);
    const overrides = {};
    for (const [id, value] of Object.entries(state.tripOverrides || {})) {
      if (isBoardId(id)) overrides[id] = value;
    }
    state.tripOverrides = overrides;
    return state;
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isDemoRecord(row) {
  return Boolean(row?.is_demo);
}

function catalog(userId) {
  return chicagoBoardTrips(userId);
}

function seedState() {
  return loadState();
}

function applyOverrides(trips, state) {
  const cancelled = new Set(state.cancelledTripIds || []);
  return trips
    .filter((row) => !cancelled.has(row.id))
    .map((row) => ({ ...row, ...(state.tripOverrides?.[row.id] || {}) }));
}


export function demoTrips(userId, displayName) {
  if (!userId) return [];
  const state = seedState(userId, displayName);
  let changed = false;
  for (const row of state.requests || []) {
    if (row.status === "pending" && isBoardId(row.trip_id)) {
      row.status = "accepted";
      row.reviewed_at = new Date().toISOString();
      recountSeats(state, row.trip_id, userId, displayName);
      changed = true;
    }
  }
  if (changed) saveState(state);
  return applyOverrides(catalog(userId, displayName), state);
}

export function mergeDemoTrips(dbTrips, userId, displayName) {
  const live = dbTrips || [];
  const liveIds = new Set(live.map((row) => row.id));
  return [...live, ...demoTrips(userId, displayName).filter((row) => !liveIds.has(row.id))];
}

function withTrip(request, trips) {
  const found = trips.find((row) => row.id === request.trip_id);
  return { ...request, trips: found || null };
}

export function demoRequests(userId, displayName) {
  if (!userId) return { sent: [], received: [] };
  const trips = demoTrips(userId, displayName);
  const state = seedState(userId, displayName);
  const rows = (state.requests || []).map((row) => withTrip(row, trips));
  return {
    sent: rows.filter((row) => row.requester_id === userId),
    received: rows.filter((row) => row.trips?.user_id === userId),
  };
}

export function demoNotifications(userId, displayName) {
  if (!userId) return [];
  seedState(userId, displayName);
  return (loadState().notifications || []).filter((row) => row.user_id === userId);
}

export function demoRequestSeat({ userId, displayName, trip, note }) {
  const state = seedState(userId, displayName);
  const duplicate = (state.requests || []).some(
    (row) => row.trip_id === trip.id && row.requester_id === userId && ["pending", "accepted"].includes(row.status),
  );
  if (duplicate) {
    return { error: "You already have an open request for this trip." };
  }
  const now = new Date().toISOString();
  const reserved = Boolean(trip.is_chicago);
  const request = {
    id: crypto.randomUUID(),
    trip_id: trip.id,
    requester_id: userId,
    requester_name: displayName || "You",
    status: reserved ? "accepted" : "pending",
    message: note?.trim() || null,
    created_at: now,
    reviewed_at: reserved ? now : null,
    is_demo: true,
  };
  state.requests = [request, ...state.requests];
  if (reserved) recountSeats(state, trip.id, userId, displayName);
  const override = state.tripOverrides?.[trip.id] || {};
  state.notifications = [
    {
      id: crypto.randomUUID(),
      user_id: userId,
      kind: reserved ? "request_accepted" : "request_received",
      title: reserved ? "Seat reserved" : "Request sent",
      body: reserved
        ? `Seat reserved on the Chicago rideshare trip ${trip.origin_name} → ${trip.destination_name}. That file has no student account to accept it.`
        : `Request sent for ${trip.origin_name} → ${trip.destination_name}. The owner still has to accept it.`,
      related_id: request.id,
      read_at: null,
      created_at: now,
      is_demo: true,
    },
    ...state.notifications,
  ];
  saveState(state);
  return {
    error: null,
    reserved,
    seats_taken: override.seats_taken ?? trip.seats_taken ?? 0,
    status: override.status || trip.status,
  };
}

function recountSeats(state, tripId, userId, displayName) {
  const accepted = (state.requests || []).filter((row) => row.trip_id === tripId && row.status === "accepted").length;
  const base = catalog(userId, displayName).find((row) => row.id === tripId);
  if (!base) return;
  const seats = Number(base.seats_available || 0);
  state.tripOverrides = {
    ...(state.tripOverrides || {}),
    [tripId]: {
      seats_taken: accepted,
      status: accepted >= seats ? "full" : "open",
    },
  };
}

export function demoRunAction(fn, id, userId, displayName) {
  const state = seedState(userId, displayName);
  if (fn === "cancel_trip") {
    state.cancelledTripIds = [...new Set([...(state.cancelledTripIds || []), id])];
    state.requests = (state.requests || []).map((row) => (
      row.trip_id === id && ["pending", "accepted"].includes(row.status)
        ? { ...row, status: "cancelled" }
        : row
    ));
    saveState(state);
    return { error: null, message: "Booking removed from your board." };
  }

  const request = (state.requests || []).find((row) => row.id === id);
  if (!request) return { error: "Request not found." };

  if (fn === "cancel_ride_request") {
    if (request.requester_id !== userId) return { error: "You can cancel only your own request." };
    request.status = "cancelled";
    recountSeats(state, request.trip_id, userId, displayName);
    saveState(state);
    return { error: null, message: "Updated." };
  }

  if (fn === "accept_ride_request") {
    const trips = applyOverrides(catalog(userId, displayName), state);
    const trip = trips.find((row) => row.id === request.trip_id);
    if (!trip || trip.user_id !== userId) return { error: "Only the trip owner can accept this request." };
    if (request.status !== "pending") return { error: "This request is no longer pending." };
    const taken = (state.requests || []).filter((row) => row.trip_id === trip.id && row.status === "accepted").length;
    if (taken >= Number(trip.seats_available || 0)) return { error: "No seats are left on this trip." };
    request.status = "accepted";
    request.reviewed_at = new Date().toISOString();
    recountSeats(state, request.trip_id, userId, displayName);
    state.notifications = [
      {
        id: crypto.randomUUID(),
        user_id: userId,
        kind: "request_accepted",
        title: "Seat accepted",
        body: `You accepted ${request.requester_name || "a rider"} on ${trip.origin_name} → ${trip.destination_name}.`,
        related_id: request.id,
        read_at: null,
        created_at: new Date().toISOString(),
        is_demo: true,
      },
      ...state.notifications,
    ];
    saveState(state);
    return { error: null, message: "Request accepted. The seat is reserved." };
  }

  if (fn === "reject_ride_request") {
    if (request.status !== "pending") return { error: "This request is no longer pending." };
    request.status = "rejected";
    request.reviewed_at = new Date().toISOString();
    saveState(state);
    return { error: null, message: "Updated." };
  }

  return { error: "Unknown action." };
}

export function demoRevealEmail(requestId) {
  const request = (loadState().requests || []).find((row) => row.id === requestId);
  if (!request || request.status !== "accepted") {
    return { error: "Email is available after a request is accepted." };
  }
  return { error: "This Chicago rideshare trip has no rider email on file." };
}

export function demoMarkRead(id, userId) {
  const state = loadState();
  state.notifications = (state.notifications || []).map((row) => (
    row.id === id && row.user_id === userId ? { ...row, read_at: new Date().toISOString() } : row
  ));
  saveState(state);
}
