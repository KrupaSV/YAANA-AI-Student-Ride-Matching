import ml_api
from fastapi.testclient import TestClient

client = TestClient(ml_api.app)

VALID = {
    "time_difference_min": 10,
    "route_overlap_pct": 80,
    "detour_km": 1.2,
    "distance_km": 8.4,
    "same_transport_mode": 1,
    "destination_distance_km": 0.8,
    "seats_available": 2,
    "max_detour_km": 5,
    "max_time_difference_min": 120,
}


def test_health():
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "Random Forest Classifier"
    assert body["status"] == "running"


def test_predict_returns_score_and_separate_constraints():
    response = client.post("/predict", json=VALID)
    assert response.status_code == 200
    body = response.json()
    assert body["constraints"]["eligible"] is True
    assert body["constraints"]["reasons"] == []
    assert 0 <= body["match_probability"] <= 1
    assert "chicago" in body["data_note"].lower()
    assert isinstance(body["prediction"], int)


def test_hard_constraints_do_not_hide_the_score():
    payload = {**VALID, "seats_available": 0, "detour_km": 12, "time_difference_min": 200}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["constraints"]["eligible"] is False
    assert body["constraints"]["seats_ok"] is False
    assert body["constraints"]["detour_ok"] is False
    assert body["constraints"]["time_ok"] is False
    assert body["constraints"]["reasons"]
    assert 0 <= body["match_probability"] <= 1


def test_rejects_invalid_overlap():
    response = client.post("/predict", json={**VALID, "route_overlap_pct": 140})
    assert response.status_code == 422


def test_search_requires_a_real_query():
    response = client.get("/geo/search", params={"q": "a"})
    assert response.status_code == 422


def test_search_uses_provider_results(monkeypatch):
    monkeypatch.setattr(ml_api, "enforce_rate", lambda *args, **kwargs: None)

    class FakeResponse:
        status_code = 200

        def json(self):
            return [{"display_name": "DSU, Bengaluru", "lat": "12.89", "lon": "77.64"}]

    monkeypatch.setattr(ml_api.httpx, "get", lambda *args, **kwargs: FakeResponse())
    response = client.get("/geo/search", params={"q": "dsu campus"})
    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["label"] == "DSU, Bengaluru"
    assert body["results"][0]["lat"] == 12.89


def test_route_reports_provider_failure(monkeypatch):
    def fail(*args, **kwargs):
        raise ml_api.httpx.ConnectError("down")

    monkeypatch.setattr(ml_api, "enforce_rate", lambda *args, **kwargs: None)
    monkeypatch.setattr(ml_api.httpx, "get", fail)
    response = client.post("/geo/route", json={
        "origin_lat": 12.93,
        "origin_lng": 77.61,
        "destination_lat": 12.89,
        "destination_lng": 77.64,
    })
    assert response.status_code == 502
