import { supabase, friendlyError } from "./supabase";
import { evaluatePair, pairPayload, shouldCreateMatch } from "./autoMatch";

export function isMissingMatchTable(error) {
  const message = error?.message || error || "";
  return /trip_matches|schema cache|does not exist|could not find the table/i.test(String(message));
}

export async function loadOpenStudentTrips(userId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("status", "open")
    .gt("departure_at", now)
    .order("departure_at", { ascending: true });
  if (error) return { trips: [], error };
  const rows = (data || []).filter((trip) => !String(trip.id).startsWith("chi-") && !trip.is_chicago);
  return {
    mine: rows.filter((trip) => trip.user_id === userId),
    others: rows.filter((trip) => trip.user_id !== userId),
    error: null,
  };
}

export async function syncMatchesForTrip(trip, others = []) {
  if (!supabase || !trip?.id) return { created: 0, missingTable: false, error: null };
  const { data: existingRows, error: existingError } = await supabase
    .from("trip_matches")
    .select("id, trip_a_id, trip_b_id, status")
    .or(`trip_a_id.eq.${trip.id},trip_b_id.eq.${trip.id}`);
  if (existingError) {
    return {
      created: 0,
      missingTable: isMissingMatchTable(existingError),
      error: friendlyError(existingError),
    };
  }

  const existing = new Map();
  for (const row of existingRows || []) {
    existing.set(`${row.trip_a_id}:${row.trip_b_id}`, row);
  }

  let created = 0;
  for (const other of others) {
    if (!other?.id || other.user_id === trip.user_id) continue;
    const evaluation = evaluatePair(trip, other);
    const payload = pairPayload(trip, other, evaluation);
    const key = `${payload.trip_a_id}:${payload.trip_b_id}`;
    if (!shouldCreateMatch(existing.get(key), evaluation)) continue;
    const { error: insertError } = await supabase.from("trip_matches").insert(payload);
    if (!insertError) {
      created += 1;
      existing.set(key, { status: "pending" });
    } else if (isMissingMatchTable(insertError)) {
      return { created, missingTable: true, error: friendlyError(insertError) };
    } else if (!/duplicate|unique|stable order|ordered/i.test(insertError.message || "")) {
      return { created, missingTable: false, error: friendlyError(insertError) };
    }
  }
  return { created, missingTable: false, error: null };
}

export async function syncMatchesForUser(userId) {
  const loaded = await loadOpenStudentTrips(userId);
  if (loaded.error) {
    return { created: 0, missingTable: isMissingMatchTable(loaded.error), error: friendlyError(loaded.error), mine: [], others: [] };
  }
  let created = 0;
  let missingTable = false;
  let error = null;
  for (const trip of loaded.mine) {
    const result = await syncMatchesForTrip(trip, loaded.others);
    created += result.created;
    if (result.missingTable) missingTable = true;
    if (result.error) error = result.error;
  }
  return { created, missingTable, error, mine: loaded.mine, others: loaded.others };
}

export function myResponse(match, userId) {
  if (!match || !userId) return "pending";
  return match.user_a_id === userId ? match.response_a : match.response_b;
}

export function theirResponse(match, userId) {
  if (!match || !userId) return "pending";
  return match.user_a_id === userId ? match.response_b : match.response_a;
}

export function peerFromMatch(match, userId) {
  const mineIsA = match.user_a_id === userId;
  return {
    userId: mineIsA ? match.user_b_id : match.user_a_id,
    name: mineIsA ? match.b_display_name : match.a_display_name,
    avatarUrl: mineIsA ? match.b_avatar_url : match.a_avatar_url,
    trip: mineIsA ? match.trip_b : match.trip_a,
  };
}

export function ownTripFromMatch(match, userId) {
  return match.user_a_id === userId ? match.trip_a : match.trip_b;
}
