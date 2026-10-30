import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePair,
  nextMatchStatus,
  orderedTripIds,
  shouldCreateMatch,
} from "./autoMatch.js";

function trip(overrides = {}) {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    user_id: "11111111-1111-1111-1111-111111111111",
    status: "open",
    origin_name: "The Loop",
    destination_name: "Lincoln Park",
    origin_lat: 41.8789,
    origin_lng: -87.6252,
    destination_lat: 41.9227,
    destination_lng: -87.6495,
    departure_at: "2026-10-31T16:00:00+05:30",
    transport_mode: "Auto",
    seats_available: 2,
    seats_taken: 0,
    route_geometry: [
      [41.8789, -87.6252],
      [41.9008, -87.6374],
      [41.9227, -87.6495],
    ],
    distance_km: 7.7,
    ...overrides,
  };
}

const classmate = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
  user_id: "22222222-2222-2222-2222-222222222222",
};

test("1. same pickup, destination, date and departure time matches", () => {
  const result = evaluatePair(trip(), trip(classmate));
  assert.equal(result.compatible, true);
  assert.ok(result.score >= 55);
});

test("2. different pickups but same destination and nearby departure times match", () => {
  const result = evaluatePair(
    trip(),
    trip({
      ...classmate,
      origin_name: "River North",
      origin_lat: 41.8924,
      origin_lng: -87.634,
      departure_at: "2026-10-31T16:10:00+05:30",
    }),
  );
  assert.equal(result.compatible, true);
  assert.ok(result.pickupKm > 0);
  assert.ok(result.destinationKm < 1);
});

test("3. same destination but very different departure times do not match", () => {
  const result = evaluatePair(
    trip(),
    trip({ ...classmate, departure_at: "2026-10-31T19:00:00+05:30" }),
  );
  assert.equal(result.compatible, false);
  assert.match(result.reasons.join(" "), /30 minutes/);
});

test("4. different destinations and unrelated routes do not match", () => {
  const result = evaluatePair(
    trip(),
    trip({
      ...classmate,
      origin_lat: 41.9742,
      origin_lng: -87.9073,
      destination_lat: 41.7868,
      destination_lng: -87.7522,
      origin_name: "O'Hare",
      destination_name: "Midway",
      route_geometry: [
        [41.9742, -87.9073],
        [41.8807, -87.8298],
        [41.7868, -87.7522],
      ],
    }),
  );
  assert.equal(result.compatible, false);
});

test("5. different travel dates do not match", () => {
  const result = evaluatePair(
    trip(),
    trip({ ...classmate, departure_at: "2026-11-01T16:00:00+05:30" }),
  );
  assert.equal(result.compatible, false);
  assert.match(result.reasons.join(" "), /same travel date/);
});

test("6. different transport modes do not match", () => {
  const result = evaluatePair(
    trip(),
    trip({ ...classmate, transport_mode: "Cab" }),
  );
  assert.equal(result.compatible, false);
  assert.match(result.reasons.join(" "), /transport/);
});

test("7. insufficient available seats do not match", () => {
  const result = evaluatePair(
    trip({ seats_available: 1, seats_taken: 1 }),
    trip(classmate),
  );
  assert.equal(result.compatible, false);
  assert.match(result.reasons.join(" "), /open seat/);
});

test("8. a later published trip still matches an earlier one", () => {
  const first = trip();
  const later = trip({
    ...classmate,
    departure_at: "2026-10-31T16:05:00+05:30",
  });
  assert.equal(evaluatePair(later, first).compatible, true);
});

test("9. both students accepting confirms the match", () => {
  assert.equal(nextMatchStatus("accepted", "accepted"), "confirmed");
});

test("10. one student rejecting rejects the match", () => {
  assert.equal(nextMatchStatus("accepted", "rejected"), "rejected");
  assert.equal(nextMatchStatus("rejected", "pending"), "rejected");
});

test("11. duplicate match records are not created", () => {
  const evaluation = evaluatePair(trip(), trip(classmate));
  assert.equal(shouldCreateMatch(null, evaluation), true);
  assert.equal(shouldCreateMatch({ status: "pending" }, evaluation), false);
  assert.equal(shouldCreateMatch({ status: "rejected" }, evaluation), false);
  assert.deepEqual(
    orderedTripIds(classmate.id, trip().id),
    orderedTripIds(trip().id, classmate.id),
  );
});

test("12. no compatible classmates yields no match", () => {
  const result = evaluatePair(
    trip(),
    trip({
      ...classmate,
      departure_at: "2026-11-02T09:00:00+05:30",
      origin_lat: 12.91,
      origin_lng: 77.64,
      destination_lat: 12.89,
      destination_lng: 77.65,
      transport_mode: "Bike",
      route_geometry: [],
    }),
  );
  assert.equal(result.compatible, false);
});

test("same destination and time is not enough when pickups are far and routes do not overlap", () => {
  const result = evaluatePair(
    trip({ route_geometry: [[41.8789, -87.6252], [41.9227, -87.6495]] }),
    trip({
      ...classmate,
      origin_lat: 41.9742,
      origin_lng: -87.9073,
      route_geometry: [[41.9742, -87.9073], [41.9227, -87.6495]],
    }),
  );
  assert.equal(result.compatible, false);
});
