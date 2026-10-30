const RANK_BAND = {
  recommended: 0,
  "not-recommended": 1,
  "outside-range": 2,
  unverified: 3,
};

export function classifyScoredTrip(score) {
  if (!score) return "unverified";
  if (score.in_distribution !== true) return "outside-range";
  if (score.constraints?.eligible && score.prediction === 1) return "recommended";
  return "not-recommended";
}

export function rankScoredTrips(items, sort = "rank") {
  const value = (item) => {
    if (sort === "time") return item.facts?.timeDifference ?? Number.POSITIVE_INFINITY;
    if (sort === "detour") return item.detour ?? Number.POSITIVE_INFINITY;
    if (sort === "overlap") return -(item.facts?.overlap ?? -1);
    const band = RANK_BAND[classifyScoredTrip(item.score)] ?? 9;
    const score = item.score?.match_percentage == null ? 101 : -Number(item.score.match_percentage);
    const overlap = -(item.facts?.overlap ?? -1);
    const time = item.facts?.timeDifference ?? Number.POSITIVE_INFINITY;
    return [band, score, overlap, time];
  };
  const compare = (a, b) => {
    const left = value(a);
    const right = value(b);
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
      }
      return 0;
    }
    return left - right;
  };
  return [...items].sort(compare).map((item, index) => ({ ...item, rank: index + 1 }));
}

export function seatRequestBlocked(trip, score) {
  if (!trip || trip.status !== "open") return true;
  if (score?.constraints?.eligible === false) return true;
  return false;
}
