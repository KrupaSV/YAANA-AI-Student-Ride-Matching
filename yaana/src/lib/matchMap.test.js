import assert from "node:assert/strict";
import test from "node:test";
import { compareMatchRoutes } from "./matchMap.js";

function trip(id, route, name = "Pickup landmark") {
  return {
    id,
    route_geometry: route,
    origin_lat: route?.[0]?.[0],
    origin_lng: route?.[0]?.[1],
    origin_name: name,
  };
}

const route = [[12.9, 77.6], [12.9, 77.61], [12.91, 77.61]];

test("identical routes highlight the full road and suggest the original pickup", () => {
  const result = compareMatchRoutes(trip("a", route), trip("b", route));
  assert.equal(result.shared.length, 1);
  assert.ok(result.sharedMeters > 2100 && result.sharedMeters < 2300);
  assert.deepEqual(result.shared[0].at(-1), route.at(-1));
  assert.deepEqual(result.pickup, { position: route[0], label: "Near Pickup landmark" });
});

test("both students see the same pickup and shared geometry with different pickups", () => {
  const first = trip("a", route);
  const second = trip("b", [[12.9, 77.603], route[1], route[2]], "Bus stop");
  const fromFirst = compareMatchRoutes(first, second);
  const fromSecond = compareMatchRoutes(second, first);
  assert.deepEqual(fromFirst.pickup, fromSecond.pickup);
  assert.deepEqual(fromFirst.shared, fromSecond.shared);
  assert.notDeepEqual(fromFirst.pickup.position, route[0]);
  assert.equal(fromFirst.pickup.label, "Near Bus stop");
  assert.deepEqual(fromSecond.ownRoute, second.route_geometry);
});

test("opposite directions and crossing roads have no shared stretch", () => {
  const reverse = trip("b", [...route].reverse());
  const crossing = trip("c", [[12.89, 77.605], [12.905, 77.605]]);
  for (const other of [reverse, crossing]) {
    const result = compareMatchRoutes(trip("a", route), other);
    assert.deepEqual(result.shared, []);
    assert.equal(result.pickup, null);
  }
});

test("separate shared stretches leave a gap and a distant pickup is withheld", () => {
  const first = trip("a", [[12.9, 77.6], [12.9, 77.625]]);
  const second = trip("b", [
    [12.89, 77.61], [12.9, 77.61], [12.9, 77.613], [12.905, 77.613],
    [12.905, 77.62], [12.9, 77.62], [12.9, 77.625],
  ]);
  const result = compareMatchRoutes(first, second);
  assert.equal(result.shared.length, 2);
  assert.ok(result.shared[0].at(-1)[1] < result.shared[1][0][1]);
  assert.equal(result.pickup, null);
});

test("old or incomplete geometry cannot produce a false shared stretch", () => {
  for (const unavailable of [undefined, trip("b", [route[0], [null, 77.6], route[2]]), trip("c", [route[0], route[0]])]) {
    const result = compareMatchRoutes(trip("a", route), unavailable);
    assert.deepEqual(result.ownRoute, route);
    assert.deepEqual(result.peerRoute, []);
    assert.deepEqual(result.shared, []);
    assert.equal(result.pickup, null);
  }
});

test("markers keep the published coordinates when nearby pickups differ", () => {
  const first = { ...trip("a", route), origin_lat: 12.90003, destination_lat: 12.91, destination_lng: 77.61 };
  const second = { ...first, id: "b", origin_lat: 12.90006, origin_name: "Bus stop" };
  const result = compareMatchRoutes(first, second);
  assert.deepEqual(result.pickups.map(({ position }) => position), [[12.90003, 77.6], [12.90006, 77.6]]);
  assert.equal(result.pickups[1].riders[0].place, "Bus stop");
  assert.deepEqual(result.destinations[0].riders.map(({ owner }) => owner), ["own", "peer"]);
});

test("matching exact pickups stacks both characters on one point even without a road route", () => {
  const first = { id: "a", origin_lat: "12.9", origin_lng: "77.6", origin_name: "Landmark" };
  const result = compareMatchRoutes(first, { ...first, id: "b", origin_lat: 12.9 });
  assert.deepEqual(result.pickups, [{
    position: [12.9, 77.6],
    riders: [{ owner: "own", place: "Landmark" }, { owner: "peer", place: "Landmark" }],
  }]);
  assert.deepEqual(result.destinations, []);
});
