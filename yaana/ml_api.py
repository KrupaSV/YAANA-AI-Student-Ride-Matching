from pathlib import Path
import os
import threading
import time

import httpx
import joblib
import pandas as pd
import sklearn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.preprocess import ColumnOrderTransformer

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "yaana_model.joblib"
NOMINATIM = "https://nominatim.openstreetmap.org"
OSRM = "https://router.project-osrm.org"
USER_AGENT = "YAANA-DSU-student-rides/2.0 (educational campus project)"
BENGALURU_VIEWBOX = "77.45,12.80,77.80,13.15"
CHICAGO_VIEWBOX = "-87.94,42.08,-87.50,41.62"
# yaana_model.joblib was fit with this scikit-learn release. Scoring refuses any other release.
REQUIRED_SKLEARN = "1.9.1"
# Same mile factor the Chicago board uses when it stores recorded miles as kilometres.
KM_PER_MILE = 1.60934
# chicago_tnp_pairs.csv time_difference_min runs from 0 through 45. Wider gaps are not scored.
TRAINING_TIME_MAX_MIN = 45
SCORE_NOTE = (
    "This Chicago rule score is based on Chicago rideshare data. "
    "It is not the probability that two DSU students will share a ride."
)
DISTANCE_NOTE = (
    "The app sends distance_km in kilometres. Only that feature is divided by 1.60934 "
    "so the Chicago model receives miles, matching the training column. "
    "detour_km and destination_distance_km stay in kilometres."
)
TRANSPORT_NOTE = (
    "same_transport_mode is 1 on every Chicago training row, so this model has not learned "
    "transport-mode compatibility. The value sent by the app is used only for a separate eligibility check. "
    "The model always receives 1."
)

LOCAL_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
)


def parse_cors_origins(raw: str | None) -> list[str]:
    """Local Vite origins plus explicit production URLs from CORS_ORIGINS. Wildcards are ignored."""
    origins: list[str] = []
    seen: set[str] = set()
    extras = [part.strip() for part in (raw or "").split(",")]
    for item in [*LOCAL_ORIGINS, *extras]:
        origin = item.strip().rstrip("/")
        if not origin or origin == "*":
            continue
        if not (origin.startswith("http://") or origin.startswith("https://")):
            continue
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)
    return origins


ALLOWED_ORIGINS = parse_cors_origins(os.environ.get("CORS_ORIGINS"))

app = FastAPI(title="YAANA Match Intelligence API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_buckets = {"nominatim": 0.0, "osrm": 0.0}
_lock = threading.Lock()
SAVED = None
MODEL = None
FEATURES = None


def sklearn_guard():
    installed = sklearn.__version__
    if installed != REQUIRED_SKLEARN:
        return (
            f"scikit-learn {installed} does not match the model training version {REQUIRED_SKLEARN}. "
            "YAANA will not score with a different scikit-learn version. "
            r"Start the API with the project virtual environment: ..\.venv\Scripts\python.exe -m uvicorn ml_api:app --reload --port 8000"
        )
    return None


def pickled_sklearn_version(model):
    version = getattr(model, "_sklearn_version", None)
    if version:
        return str(version)
    for step in (getattr(model, "named_steps", None) or {}).values():
        version = getattr(step, "_sklearn_version", None)
        if version:
            return str(version)
    return None


LOAD_ERROR = sklearn_guard()
if LOAD_ERROR is None and MODEL_PATH.exists():
    try:
        SAVED = joblib.load(MODEL_PATH)
        loaded = SAVED.get("pipeline") or SAVED.get("model")
        pickled = pickled_sklearn_version(loaded)
        if pickled and pickled != REQUIRED_SKLEARN:
            LOAD_ERROR = (
                f"yaana_model.joblib was saved with scikit-learn {pickled}, "
                f"but scoring requires {REQUIRED_SKLEARN}."
            )
        elif loaded is None or not SAVED.get("features"):
            LOAD_ERROR = "The saved model file has no pipeline or feature list."
        else:
            MODEL = loaded
            FEATURES = SAVED.get("features")
    except Exception as exc:
        LOAD_ERROR = f"{type(exc).__name__}: {exc}"
elif LOAD_ERROR is None:
    LOAD_ERROR = "yaana_model.joblib is missing."


class TripFeatures(BaseModel):
    time_difference_min: int = Field(ge=0, le=1440)
    route_overlap_pct: float = Field(ge=0, le=100)
    detour_km: float = Field(ge=0, le=100)
    distance_km: float = Field(gt=0, le=500)
    same_transport_mode: int = Field(ge=0, le=1)
    destination_distance_km: float = Field(ge=0, le=500)
    seats_available: int = Field(ge=0, le=6)
    max_detour_km: float = Field(default=5, gt=0, le=30)
    max_time_difference_min: int | None = Field(default=None, ge=0, le=1440)


class RouteBody(BaseModel):
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)


class DetourBody(BaseModel):
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    drop_lat: float = Field(ge=-90, le=90)
    drop_lng: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)
    direct_distance_km: float = Field(gt=0, le=500)


def enforce_rate(bucket: str, interval: float = 1.0) -> None:
    now = time.monotonic()
    with _lock:
        wait = _buckets[bucket] + interval - now
        if wait > 0:
            raise HTTPException(status_code=429, detail="The map provider is rate limited. Wait a second and try again.")
        _buckets[bucket] = now


def provider_get(url: str, params: dict, bucket: str):
    enforce_rate(bucket)
    try:
        response = httpx.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=8.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"The map provider did not respond ({type(exc).__name__}).") from exc
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="The public map provider asked YAANA to slow down.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="The map provider rejected the request.")
    return response.json()


def simplify(coordinates, limit=120):
    points = [[lat, lng] for lng, lat in coordinates]
    if len(points) <= limit:
        return points
    step = (len(points) - 1) / (limit - 1)
    return [points[round(index * step)] for index in range(limit)]


def kilometres_to_training_miles(distance_km: float) -> float:
    """Application distances are kilometres. The Chicago pair column named distance_km is recorded miles."""
    return round(float(distance_km) / KM_PER_MILE, 3)


def model_feature_frame(trip: TripFeatures) -> pd.DataFrame:
    """Build the row the saved forest sees. Other distance features are left in kilometres."""
    row = trip.model_dump()
    row["distance_km"] = kilometres_to_training_miles(trip.distance_km)
    row["same_transport_mode"] = 1
    return pd.DataFrame([row])


def constraint_report(trip: TripFeatures) -> dict:
    reasons = []
    seats_ok = trip.seats_available > 0
    detour_ok = trip.detour_km <= trip.max_detour_km
    time_ok = True if trip.max_time_difference_min is None else trip.time_difference_min <= trip.max_time_difference_min
    transport_ok = trip.same_transport_mode == 1
    if not seats_ok:
        reasons.append("No seats are available.")
    if not detour_ok:
        reasons.append("The estimated road detour is above the allowed limit.")
    if not time_ok:
        reasons.append("The departure times are too far apart.")
    if not transport_ok:
        reasons.append("The trips use different transport modes.")
    return {
        "seats_ok": seats_ok,
        "detour_ok": detour_ok,
        "time_ok": time_ok,
        "transport_ok": transport_ok,
        "eligible": seats_ok and detour_ok and time_ok and transport_ok,
        "reasons": reasons,
    }


def score_trip(trip: TripFeatures) -> dict:
    if MODEL is None or not FEATURES:
        raise HTTPException(status_code=503, detail=LOAD_ERROR or "The trained model is unavailable.")
    report = {
        "constraints": constraint_report(trip),
        "data_note": (SAVED or {}).get("data_note") or "The trained model did not include a dataset note.",
        "score_note": SCORE_NOTE,
        "distance_input_km": trip.distance_km,
        "distance_feature_miles": kilometres_to_training_miles(trip.distance_km),
        "distance_conversion_note": DISTANCE_NOTE,
        "model_same_transport_mode": 1,
        "transport_note": TRANSPORT_NOTE,
        "training_time_max_min": TRAINING_TIME_MAX_MIN,
    }
    if trip.time_difference_min > TRAINING_TIME_MAX_MIN:
        report.update({
            "in_distribution": False,
            "prediction": None,
            "match_probability": None,
            "match_percentage": None,
            "range_note": (
                f"The departure gap is {trip.time_difference_min} minutes, outside the Chicago training range of "
                f"0–{TRAINING_TIME_MAX_MIN} minutes. No Chicago rule score was calculated, and the gap was not changed."
            ),
        })
        return report
    frame = model_feature_frame(trip)
    if SAVED and SAVED.get("pipeline") is not None:
        probabilities = MODEL.predict_proba(frame)[0]
        prediction = int(MODEL.predict(frame)[0])
        classes = list(MODEL.named_steps["forest"].classes_)
    else:
        model_frame = frame.loc[:, FEATURES]
        probabilities = MODEL.predict_proba(model_frame)[0]
        prediction = int(MODEL.predict(model_frame)[0])
        classes = list(MODEL.classes_)
    match_probability = float(probabilities[classes.index(1)]) if 1 in classes else 0.0
    report.update({
        "in_distribution": True,
        "prediction": prediction,
        "match_probability": round(match_probability, 4),
        "match_percentage": round(match_probability * 100, 2),
        "range_note": f"The departure gap is inside the Chicago training range of 0–{TRAINING_TIME_MAX_MIN} minutes.",
    })
    return report


@app.get("/")
def home():
    return {
        "app": "YAANA Match Intelligence",
        "status": "running" if MODEL is not None else "model-missing",
        "model": "Random Forest Classifier",
        "sklearn": sklearn.__version__,
        "required_sklearn": REQUIRED_SKLEARN,
        "load_error": LOAD_ERROR,
        "flow": "Chicago rideshare pairs, geographic shareability label",
    }


@app.post("/predict")
def predict(trip: TripFeatures):
    return score_trip(trip)


@app.get("/geo/search")
def search(q: str = Query(min_length=3, max_length=120)):
    payload = provider_get(
        f"{NOMINATIM}/search",
        {
            "q": q,
            "format": "jsonv2",
            "limit": 5,
            "countrycodes": "us,in",
            "viewbox": CHICAGO_VIEWBOX,
            "bounded": 0,
        },
        "nominatim",
    )
    return {
        "results": [
            {
                "label": item.get("display_name"),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
            }
            for item in payload
            if item.get("lat") and item.get("lon")
        ],
        "provider": "Nominatim / OpenStreetMap",
        "limitation": "Public Nominatim allows about one request per second and is not a production geocoder.",
    }


@app.get("/geo/reverse")
def reverse(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)):
    payload = provider_get(
        f"{NOMINATIM}/reverse",
        {"lat": lat, "lon": lng, "format": "jsonv2"},
        "nominatim",
    )
    label = payload.get("display_name")
    if not label:
        raise HTTPException(status_code=404, detail="No place name was found for that point.")
    return {
        "label": label,
        "lat": lat,
        "lng": lng,
        "provider": "Nominatim / OpenStreetMap",
    }


def osrm_route(points):
    path = ";".join(f"{lng},{lat}" for lat, lng in points)
    payload = provider_get(
        f"{OSRM}/route/v1/driving/{path}",
        {"overview": "full", "geometries": "geojson"},
        "osrm",
    )
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise HTTPException(status_code=404, detail="No road route was found between those points.")
    route = payload["routes"][0]
    return {
        "distance_km": round(route["distance"] / 1000, 2),
        "duration_min": round(route["duration"] / 60, 1),
        "geometry": simplify(route["geometry"]["coordinates"]),
        "provider": "OSRM",
        "limitation": "The public OSRM server is a demo. It can refuse or throttle traffic, and its driving estimate is not a booked fare.",
    }


@app.post("/geo/route")
def route(body: RouteBody):
    return osrm_route([
        (body.origin_lat, body.origin_lng),
        (body.destination_lat, body.destination_lng),
    ])


@app.post("/geo/detour")
def detour(body: DetourBody):
    via = osrm_route([
        (body.origin_lat, body.origin_lng),
        (body.pickup_lat, body.pickup_lng),
        (body.drop_lat, body.drop_lng),
        (body.destination_lat, body.destination_lng),
    ])
    extra = round(max(0, via["distance_km"] - body.direct_distance_km), 2)
    return {
        "detour_km": extra,
        "via_distance_km": via["distance_km"],
        "provider": "OSRM",
        "limitation": via["limitation"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "ml_api:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=False,
    )
