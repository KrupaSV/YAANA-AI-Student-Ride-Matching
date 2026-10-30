"""Build training pairs from City of Chicago rideshare trips.

Source: Transportation Network Providers - Trips
https://data.cityofchicago.org/Transportation/Transportation-Network-Providers-Trips/m6dm-c72p

The city file records real pickups, drop-offs, miles, and start times.
It does not say which two trips shared a vehicle, so the label is a
shareability rule on those recorded points, not an observed co-rider id.
"""

import json
import math
import random
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "data"
RAW_PATH = DATA_DIR / "chicago_tnp_trips.csv"
PAIRS_PATH = DATA_DIR / "chicago_tnp_pairs.csv"
SOURCE_PATH = DATA_DIR / "source.json"

API = "https://data.cityofchicago.org/resource/m6dm-c72p.json"
DATASET_PAGE = "https://data.cityofchicago.org/Transportation/Transportation-Network-Providers-Trips/m6dm-c72p"
DAY = "2019-10-25"
START_MINUTES = 16 * 60
END_MINUTES = 17 * 60 + 15
PAGE_LIMIT = 1500
CELL = 0.012

POSITIVE_PICKUP_KM = 0.8
POSITIVE_DROPOFF_KM = 1.0
POSITIVE_MINUTES = 30
NEGATIVE_MINUTES = 45
NEGATIVE_PICKUP_KM = 3.0
NEGATIVE_DROPOFF_KM = 4.0
PAIR_CAP = 4000


def slots():
    minutes = START_MINUTES
    while minutes <= END_MINUTES:
        hour, minute = divmod(minutes, 60)
        yield f"{DAY}T{hour:02d}:{minute:02d}:00.000"
        minutes += 15


def fetch_slot(stamp):
    rows = []
    offset = 0
    while True:
        params = {
            "trip_start_timestamp": stamp,
            "$select": ",".join([
                "trip_id",
                "trip_start_timestamp",
                "trip_miles",
                "trip_seconds",
                "trips_pooled",
                "pickup_centroid_latitude",
                "pickup_centroid_longitude",
                "dropoff_centroid_latitude",
                "dropoff_centroid_longitude",
            ]),
            "$limit": PAGE_LIMIT,
            "$offset": offset,
        }
        url = f"{API}?{urllib.parse.urlencode(params)}"
        payload = None
        for attempt in range(4):
            request = urllib.request.Request(url, headers={"User-Agent": "YAANA-campus-project"})
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    payload = json.load(response)
                break
            except Exception as exc:
                print(f"retry {stamp} offset {offset}: {type(exc).__name__}", flush=True)
                time.sleep(2 + attempt * 2)
        if payload is None:
            break
        rows.extend(payload)
        print(f"{stamp} offset {offset}: {len(payload)}", flush=True)
        break
    return rows


def parse_trips(raw_rows):
    trips = []
    seen = set()
    for row in raw_rows:
        trip_id = row.get("trip_id")
        if not trip_id or trip_id in seen:
            continue
        try:
            pickup = (float(row["pickup_centroid_latitude"]), float(row["pickup_centroid_longitude"]))
            dropoff = (float(row["dropoff_centroid_latitude"]), float(row["dropoff_centroid_longitude"]))
            miles = float(row["trip_miles"])
            stamp = row["trip_start_timestamp"]
        except (KeyError, TypeError, ValueError):
            continue
        if miles < 0.3 or miles > 40:
            continue
        if not (-90 <= pickup[0] <= 90 and -90 <= dropoff[0] <= 90):
            continue
        hour, minute = [int(part) for part in stamp[11:16].split(":")]
        seen.add(trip_id)
        trips.append({
            "trip_id": trip_id,
            "stamp": stamp,
            "minute": hour * 60 + minute,
            "miles": miles,
            "seconds": float(row.get("trip_seconds") or 0),
            "pooled": int(float(row.get("trips_pooled") or 1)),
            "pickup": pickup,
            "dropoff": dropoff,
        })
    return trips


def haversine(a, b):
    earth = 6371.0
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return earth * 2 * math.asin(min(1, math.sqrt(h)))


def sample_line(start, end, count=12):
    return [
        (
            start[0] + (end[0] - start[0]) * (index / (count - 1)),
            start[1] + (end[1] - start[1]) * (index / (count - 1)),
        )
        for index in range(count)
    ]


def overlap_percent(left, right, threshold_km=0.4):
    a = sample_line(left["pickup"], left["dropoff"])
    b = sample_line(right["pickup"], right["dropoff"])

    def share(points, other):
        hits = 0
        for point in points:
            nearest = min(haversine(point, candidate) for candidate in other)
            if nearest <= threshold_km:
                hits += 1
        return hits / len(points)

    return round(((share(a, b) + share(b, a)) / 2) * 100, 1)


def detour_km(reference, other):
    direct = haversine(reference["pickup"], reference["dropoff"])
    via = (
        haversine(reference["pickup"], other["pickup"])
        + haversine(other["pickup"], other["dropoff"])
        + haversine(other["dropoff"], reference["dropoff"])
    )
    return round(max(0.0, via - direct), 3)


def pair_row(left, right, label):
    return {
        "trip_a": left["trip_id"],
        "trip_b": right["trip_id"],
        "time_difference_min": abs(left["minute"] - right["minute"]),
        "route_overlap_pct": overlap_percent(left, right),
        "detour_km": detour_km(left, right),
        "distance_km": round(left["miles"], 3),
        "same_transport_mode": 1,
        "destination_distance_km": round(haversine(left["dropoff"], right["dropoff"]), 3),
        "match_label": label,
    }


def build_pairs(trips):
    rng = random.Random(42)
    buckets = defaultdict(list)
    for index, trip in enumerate(trips):
        key = (
            round(trip["pickup"][0] / CELL),
            round(trip["pickup"][1] / CELL),
            trip["minute"] // 15,
        )
        buckets[key].append(index)

    positives = []
    used = set()
    for index, trip in enumerate(trips):
        if len(positives) >= PAIR_CAP:
            break
        cx = round(trip["pickup"][0] / CELL)
        cy = round(trip["pickup"][1] / CELL)
        tb = trip["minute"] // 15
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dt in (-2, -1, 0, 1, 2):
                    for other_index in buckets.get((cx + dx, cy + dy, tb + dt), []):
                        if other_index <= index or len(positives) >= PAIR_CAP:
                            continue
                        other = trips[other_index]
                        gap = abs(trip["minute"] - other["minute"])
                        pickup_gap = haversine(trip["pickup"], other["pickup"])
                        drop_gap = haversine(trip["dropoff"], other["dropoff"])
                        if gap <= POSITIVE_MINUTES and pickup_gap <= POSITIVE_PICKUP_KM and drop_gap <= POSITIVE_DROPOFF_KM:
                            key = (trip["trip_id"], other["trip_id"])
                            if key in used:
                                continue
                            used.add(key)
                            positives.append(pair_row(trip, other, 1))

    negatives = []
    attempts = 0
    while len(negatives) < PAIR_CAP and attempts < 250000:
        attempts += 1
        left, right = rng.sample(trips, 2)
        gap = abs(left["minute"] - right["minute"])
        if gap > NEGATIVE_MINUTES:
            continue
        pickup_gap = haversine(left["pickup"], right["pickup"])
        drop_gap = haversine(left["dropoff"], right["dropoff"])
        if pickup_gap < NEGATIVE_PICKUP_KM and drop_gap < NEGATIVE_DROPOFF_KM:
            continue
        key = tuple(sorted((left["trip_id"], right["trip_id"])))
        if key in used:
            continue
        used.add(key)
        negatives.append(pair_row(left, right, 0))

    frame = pd.DataFrame(positives + negatives)
    return frame.sample(frac=1, random_state=42).reset_index(drop=True), len(positives), len(negatives)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw_rows = []
    for stamp in slots():
        raw_rows.extend(fetch_slot(stamp))
    trips = parse_trips(raw_rows)
    if len(trips) < 500:
        raise SystemExit(f"Only {len(trips)} usable Chicago trips were downloaded.")
    pd.DataFrame(trips).drop(columns=["pickup", "dropoff"]).assign(
        pickup_lat=[trip["pickup"][0] for trip in trips],
        pickup_lng=[trip["pickup"][1] for trip in trips],
        dropoff_lat=[trip["dropoff"][0] for trip in trips],
        dropoff_lng=[trip["dropoff"][1] for trip in trips],
    ).to_csv(RAW_PATH, index=False)

    pairs, positive_count, negative_count = build_pairs(trips)
    if positive_count < 200 or negative_count < 200:
        raise SystemExit(f"Not enough pairs: {positive_count} positive, {negative_count} negative.")
    pairs.to_csv(PAIRS_PATH, index=False)
    SOURCE_PATH.write_text(json.dumps({
        "provider": "City of Chicago",
        "dataset": "Transportation Network Providers - Trips",
        "page": DATASET_PAGE,
        "api": API,
        "window": f"{DAY} {START_MINUTES // 60:02d}:00 through {END_MINUTES // 60:02d}:{END_MINUTES % 60:02d}",
        "raw_rows": len(raw_rows),
        "usable_trips": len(trips),
        "positive_pairs": positive_count,
        "negative_pairs": negative_count,
        "label": "shareable when recorded pickups are within 0.8 km, drop-offs within 1 km, and starts within 30 minutes",
        "not_observed": "The city file does not publish which two trips shared a vehicle.",
    }, indent=2), encoding="utf-8")
    print(json.dumps({
        "usable_trips": len(trips),
        "positive_pairs": positive_count,
        "negative_pairs": negative_count,
        "pairs_path": str(PAIRS_PATH),
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
