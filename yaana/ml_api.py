import os
import threading
import time

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from geodata.places import ATTRIBUTION, SOURCE, load_catalog

OSRM = "https://router.project-osrm.org"
USER_AGENT = "YAANA-DSU-student-rides/2.0 (educational campus project)"

LOCAL_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
)
PRODUCTION_ORIGINS = (
    "https://yaana-ai.vercel.app",
    "https://yaana-ai-student-ride-matching.vercel.app",
)


def parse_cors_origins(raw: str | None) -> list[str]:
    """YAANA's local and production origins plus any additional configured origins."""
    origins: list[str] = []
    seen: set[str] = set()
    extras = [part.strip() for part in (raw or "").split(",")]
    for item in [*LOCAL_ORIGINS, *PRODUCTION_ORIGINS, *extras]:
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

app = FastAPI(title="YAANA Map API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_last_route_request = 0.0
_lock = threading.Lock()


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


def provider_get(url: str, params: dict):
    global _last_route_request
    with _lock:
        now = time.monotonic()
        if now < _last_route_request + 1.0:
            raise HTTPException(status_code=429, detail="The routing service is rate limited. Wait a second and try again.")
        _last_route_request = now
    try:
        response = httpx.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=8.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="The routing service did not respond.") from exc
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="The routing provider asked YAANA to slow down.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="The routing provider rejected the request.")
    return response.json()


@app.get("/")
def home():
    catalog = load_catalog()
    return {
        "app": "YAANA Map API",
        "status": "running",
        "place_catalog": {
            "places": len(catalog.places),
            "source_timestamp": catalog.source_timestamp,
            "provider": SOURCE,
            "attribution": ATTRIBUTION,
        },
    }


@app.get("/geo/search")
def search(q: str = Query(min_length=2, max_length=120)):
    return {
        "results": load_catalog().search(q),
        "provider": SOURCE,
        "attribution": ATTRIBUTION,
    }


@app.get("/geo/reverse")
def reverse(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)):
    landmark = load_catalog().nearby(lat, lng)
    return {
        "label": f"Near {landmark.name}" if landmark else f"{lat:.5f}, {lng:.5f}",
        "lat": lat,
        "lng": lng,
        "provider": SOURCE,
        "attribution": ATTRIBUTION,
    }


def osrm_route(points):
    path = ";".join(f"{lng},{lat}" for lat, lng in points)
    payload = provider_get(
        f"{OSRM}/route/v1/driving/{path}",
        {"overview": "full", "geometries": "geojson"},
    )
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise HTTPException(status_code=404, detail="No road route was found between those points.")
    route = payload["routes"][0]
    return {
        "distance_km": round(route["distance"] / 1000, 2),
        "duration_min": round(route["duration"] / 60, 1),
        "geometry": [[lat, lng] for lng, lat in route["geometry"]["coordinates"]],
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
