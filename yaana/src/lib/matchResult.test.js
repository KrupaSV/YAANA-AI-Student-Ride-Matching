import assert from "node:assert/strict";
import test from "node:test";
import { classifyScoredTrip, rankScoredTrips, seatRequestBlocked } from "./matchResult.js";

test("a trip is recommended only inside the training range, with every hard check passing and class 1", () => {
  assert.equal(classifyScoredTrip({
    in_distribution: true,
    prediction: 1,
    match_percentage: 99.44,
    constraints: { eligible: true },
  }), "recommended");
});

test("a failed hard check stays not recommended even when the Chicago class is 1", () => {
  const score = {
    in_distribution: true,
    prediction: 1,
    match_percentage: 99.44,
    constraints: { eligible: false, reasons: ["No seats are available."] },
  };
  assert.equal(classifyScoredTrip(score), "not-recommended");
  assert.equal(seatRequestBlocked({ status: "open" }, score), true);
});

test("a gap outside 0–45 minutes has no recommendation and no percentage bucket", () => {
  const score = {
    in_distribution: false,
    prediction: null,
    match_percentage: null,
    constraints: { eligible: true, reasons: [] },
  };
  assert.equal(classifyScoredTrip(score), "outside-range");
  assert.equal(seatRequestBlocked({ status: "open" }, score), false);
});

test("an outside-range trip that also fails a hard check cannot request a seat", () => {
  const score = {
    in_distribution: false,
    prediction: null,
    match_percentage: null,
    constraints: { eligible: false, reasons: ["The departure times are too far apart."] },
  };
  assert.equal(classifyScoredTrip(score), "outside-range");
  assert.equal(seatRequestBlocked({ status: "open" }, score), true);
});

test("an eligible open trip can request a seat", () => {
  const score = {
    in_distribution: true,
    prediction: 1,
    constraints: { eligible: true, reasons: [] },
  };
  assert.equal(seatRequestBlocked({ status: "open" }, score), false);
});

test("a full trip cannot request a seat", () => {
  assert.equal(seatRequestBlocked({ status: "full" }, {
    in_distribution: true,
    prediction: 1,
    constraints: { eligible: true },
  }), true);
});

test("an unscored trip is unverified and the seat request stays available while the listing is open", () => {
  assert.equal(classifyScoredTrip(null), "unverified");
  assert.equal(seatRequestBlocked({ status: "open" }, null), false);
});

test("ranked matches put recommended trips first, then score, then overlap", () => {
  const ranked = rankScoredTrips([
    { trip: { id: "late" }, facts: { overlap: 90, timeDifference: 10 }, score: { in_distribution: false, constraints: { eligible: true } } },
    { trip: { id: "best" }, facts: { overlap: 40, timeDifference: 8 }, score: { in_distribution: true, prediction: 1, match_percentage: 88, constraints: { eligible: true } } },
    { trip: { id: "second" }, facts: { overlap: 80, timeDifference: 4 }, score: { in_distribution: true, prediction: 1, match_percentage: 70, constraints: { eligible: true } } },
    { trip: { id: "weak" }, facts: { overlap: 20, timeDifference: 3 }, score: { in_distribution: true, prediction: 0, match_percentage: 12, constraints: { eligible: true } } },
  ]);
  assert.deepEqual(ranked.map((item) => item.trip.id), ["best", "second", "weak", "late"]);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3, 4]);
});
