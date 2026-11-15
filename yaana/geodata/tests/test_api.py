import json

import httpx
import pytest
from fastapi.testclient import TestClient

import ml_api
from geodata.places import ALIASES_PATH, load_catalog


client = TestClient(ml_api.app)


def test_health_reports_bengaluru_catalog():
    body = client.get("/").json()
    assert body["status"] == "running"
    assert body["place_catalog"]["places"] >= 20_000
    assert body["place_catalog"]["source_timestamp"]


def test_catalog_has_unique_local_records_and_valid_alias_targets():
    places = load_catalog().places
    ids = {place.id for place in places}
    aliases = json.loads(ALIASES_PATH.read_text(encoding="utf-8"))
    assert len(places) == len(ids)
    assert aliases.keys() <= ids
    assert all(12.63 <= place.lat <= 13.24 and 77.39 <= place.lng <= 77.86 for place in places)


@pytest.mark.parametrize(("query", "expected"), [
    ("DSU", "Dayananda Sagar University, Harohalli"),
    ("dsu main cam", "Dayananda Sagar University, Harohalli"),
    ("HSR Lay", "HSR Layout"),
    ("Kudlu Gate Metro", "Kudlu Gate Metro Station"),
    ("dsu innovation campus, kudlu gate", "DSU City Innovation Campus, Kudlu Gate"),
    ("DSU City Campus", "DSU City Innovation Campus, Kudlu Gate"),
    ("Majestic Bus Stand", "Kempegowda Bus Station"),
    ("ಬೆಂಗಳೂರು", "Bengaluru"),
])
def test_local_search_ranks_bengaluru_places_without_network(monkeypatch, query, expected):
    def unexpected_call(*args, **kwargs):
        pytest.fail("Place search should use the bundled dataset")

    monkeypatch.setattr(ml_api.httpx, "get", unexpected_call)
    response = client.get("/geo/search", params={"q": query})
    assert response.status_code == 200
    first = response.json()["results"][0]
    assert first["label"] == expected
    assert 12.63 <= first["lat"] <= 13.24
    assert 77.39 <= first["lng"] <= 77.86


def test_search_unknown_place_and_input_validation():
    assert client.get("/geo/search", params={"q": "qzxxy unknown block"}).json()["results"] == []
    assert client.get("/geo/search", params={"q": "x"}).status_code == 422


def test_city_campus_uses_its_own_pin_near_sagar_it_park():
    catalog = load_catalog()
    campus = catalog.search("DSU Kudlu Gate")[0]
    metro = catalog.search("Kudlu Gate Metro")[0]
    assert campus["id"] == "dsu-city-innovation-campus"
    assert campus["kind"] == "University"
    assert 12.887 <= campus["lat"] <= 12.888
    assert 77.641 <= campus["lng"] <= 77.643
    assert abs(campus["lng"] - metro["lng"]) > 0.002
    assert catalog.nearby(campus["lat"], campus["lng"]).id == campus["id"]


def test_reverse_uses_nearby_landmark_without_moving_pin():
    campus = load_catalog().search("DSU Main Campus")[0]
    coordinates = {"lat": campus["lat"] + 0.00002, "lng": campus["lng"] + 0.00002}
    response = client.get("/geo/reverse", params=coordinates)
    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "Near Dayananda Sagar University, Harohalli"
    assert {key: body[key] for key in coordinates} == coordinates


def test_reverse_returns_coordinates_when_no_landmark_is_nearby():
    body = client.get("/geo/reverse", params={"lat": 12.52, "lng": 77.3}).json()
    assert body["label"] == "12.52000, 77.30000"
    assert (body["lat"], body["lng"]) == (12.52, 77.3)


@pytest.fixture
def route_request():
    return {"origin_lat": 12.91, "origin_lng": 77.64, "destination_lat": 12.66, "destination_lng": 77.45}


def test_route_keeps_provider_geometry_and_swaps_coordinate_order(monkeypatch, route_request):
    coordinates = [[77.64 - i / 1000, 12.91 - i / 1000] for i in range(220)]

    def route_provider(url, params):
        assert "/driving/77.64,12.91;77.45,12.66" in url
        assert params == {"overview": "full", "geometries": "geojson"}
        return {
            "code": "Ok",
            "routes": [{"geometry": {"coordinates": coordinates}, "distance": 35000, "duration": 2400}],
        }

    monkeypatch.setattr(ml_api, "provider_get", route_provider)
    response = client.post("/geo/route", json=route_request)
    assert response.status_code == 200
    body = response.json()
    assert body["geometry"] == [[lat, lng] for lng, lat in coordinates]
    assert body["distance_km"] == 35
    assert body["duration_min"] == 40


def test_route_reports_provider_failure(monkeypatch, route_request):
    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(ml_api, "_last_route_request", -1.0)
    monkeypatch.setattr(ml_api.httpx, "get", unavailable)
    assert client.post("/geo/route", json=route_request).status_code == 502


def test_route_reports_when_provider_cannot_find_a_road(monkeypatch, route_request):
    monkeypatch.setattr(ml_api, "provider_get", lambda *args: {"code": "NoRoute"})
    assert client.post("/geo/route", json=route_request).status_code == 404


def test_cors_allows_localhost_and_configured_origins():
    custom_origin = "https://configured-origin.example"
    origins = ml_api.parse_cors_origins(f"{custom_origin}/, *, not-a-url")
    assert origins[-1] == custom_origin
    assert "*" not in origins
    added = custom_origin not in ml_api.ALLOWED_ORIGINS
    if added:
        ml_api.ALLOWED_ORIGINS.append(custom_origin)
    try:
        for origin in ("http://localhost:5173", custom_origin):
            result = client.get("/", headers={"Origin": origin})
            assert result.headers["access-control-allow-origin"] == origin
    finally:
        if added:
            ml_api.ALLOWED_ORIGINS.remove(custom_origin)
    result = client.get("/", headers={"Origin": "https://unconfigured.example"})
    assert "access-control-allow-origin" not in result.headers


@pytest.mark.parametrize("origin", [
    "https://yaana-ai.vercel.app",
    "https://yaana-ai-student-ride-matching.vercel.app",
])
def test_production_site_can_request_a_route(origin):
    result = client.options("/geo/route", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert result.status_code == 200
    assert result.headers["access-control-allow-origin"] == origin
