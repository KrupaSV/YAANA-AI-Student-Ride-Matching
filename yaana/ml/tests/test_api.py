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
    assert body["sklearn"] == "1.9.1"
    assert body["required_sklearn"] == "1.9.1"
    assert body["load_error"] is None


def test_predict_returns_score_and_separate_constraints():
    response = client.post("/predict", json=VALID)
    assert response.status_code == 200
    body = response.json()
    assert body["constraints"]["eligible"] is True
    assert body["constraints"]["reasons"] == []
    assert 0 <= body["match_probability"] <= 1
    assert "chicago" in body["data_note"].lower()
    assert isinstance(body["prediction"], int)
    assert body["in_distribution"] is True
    assert body["constraints"]["transport_ok"] is True
    assert "not the probability" in body["score_note"]


def test_hard_constraints_do_not_hide_an_in_range_score():
    payload = {**VALID, "seats_available": 0, "detour_km": 12, "same_transport_mode": 0}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["in_distribution"] is True
    assert body["constraints"]["eligible"] is False
    assert body["constraints"]["seats_ok"] is False
    assert body["constraints"]["detour_ok"] is False
    assert body["constraints"]["transport_ok"] is False
    assert body["constraints"]["time_ok"] is True
    assert "No seats are available." in body["constraints"]["reasons"]
    assert "The estimated road detour is above the allowed limit." in body["constraints"]["reasons"]
    assert "The trips use different transport modes." in body["constraints"]["reasons"]
    assert 0 <= body["match_probability"] <= 1


def test_time_above_45_minutes_is_not_scored():
    payload = {**VALID, "time_difference_min": 46, "max_time_difference_min": 120}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["in_distribution"] is False
    assert body["prediction"] is None
    assert body["match_probability"] is None
    assert body["match_percentage"] is None
    assert body["constraints"]["time_ok"] is True
    assert "46 minutes" in body["range_note"]
    assert "not changed" in body["range_note"]


def test_large_time_gap_keeps_the_hard_check_and_skips_the_score():
    payload = {**VALID, "time_difference_min": 180, "max_time_difference_min": 120}
    response = client.post("/predict", json=payload)
    body = response.json()
    assert body["in_distribution"] is False
    assert body["match_probability"] is None
    assert body["constraints"]["time_ok"] is False
    assert body["constraints"]["eligible"] is False
    assert "The departure times are too far apart." in body["constraints"]["reasons"]


def test_model_receives_miles_and_a_constant_transport_mode(monkeypatch):
    captured = {}
    real_proba = ml_api.MODEL.predict_proba

    def spy(frame):
        captured["frame"] = frame.copy()
        return real_proba(frame)

    monkeypatch.setattr(ml_api.MODEL, "predict_proba", spy)
    payload = {**VALID, "distance_km": 16.0934, "detour_km": 2.2, "destination_distance_km": 3.3, "same_transport_mode": 0}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    body = response.json()
    frame = captured["frame"].iloc[0]
    assert frame["distance_km"] == 10.0
    assert frame["detour_km"] == 2.2
    assert frame["destination_distance_km"] == 3.3
    assert frame["same_transport_mode"] == 1
    assert body["distance_input_km"] == 16.0934
    assert body["distance_feature_miles"] == 10.0
    assert body["model_same_transport_mode"] == 1
    assert body["constraints"]["transport_ok"] is False
    assert "kilometres" in body["distance_conversion_note"]


SCENARIOS = {
    "high_overlap_similar_time": {
        "time_difference_min": 5,
        "route_overlap_pct": 92,
        "detour_km": 0.4,
        "distance_miles": 8,
        "destination_distance_km": 0.3,
        "seats_available": 2,
        "expect_prediction": 1,
        "expect_eligible": True,
        "expect_probability": 0.9944,
    },
    "partial_overlap": {
        "time_difference_min": 20,
        "route_overlap_pct": 45,
        "detour_km": 2.5,
        "distance_miles": 8,
        "destination_distance_km": 3.5,
        "seats_available": 2,
        "expect_prediction": 0,
        "expect_eligible": True,
        "expect_probability": 0.1595,
    },
    "different_routes": {
        "time_difference_min": 15,
        "route_overlap_pct": 3,
        "detour_km": 14,
        "distance_miles": 8,
        "destination_distance_km": 18,
        "seats_available": 2,
        "expect_prediction": 0,
        "expect_eligible": False,
        "expect_probability": 0.0001,
    },
    "unavailable_seats": {
        "time_difference_min": 5,
        "route_overlap_pct": 92,
        "detour_km": 0.4,
        "distance_miles": 8,
        "destination_distance_km": 0.3,
        "seats_available": 0,
        "expect_prediction": 1,
        "expect_eligible": False,
        "expect_probability": 0.9944,
    },
    "excessive_detour": {
        "time_difference_min": 5,
        "route_overlap_pct": 92,
        "detour_km": 12,
        "distance_miles": 8,
        "destination_distance_km": 0.3,
        "seats_available": 2,
        "expect_prediction": 0,
        "expect_eligible": False,
        "expect_probability": 0.3927,
    },
    "large_time_gap": {
        "time_difference_min": 180,
        "route_overlap_pct": 92,
        "detour_km": 0.4,
        "distance_miles": 8,
        "destination_distance_km": 0.3,
        "seats_available": 2,
        "expect_prediction": None,
        "expect_eligible": False,
        "expect_probability": None,
    },
}


def test_six_previous_scenarios_after_the_mile_conversion():
    for name, scenario in SCENARIOS.items():
        distance_km = round(scenario["distance_miles"] * ml_api.KM_PER_MILE, 5)
        payload = {
            "time_difference_min": scenario["time_difference_min"],
            "route_overlap_pct": scenario["route_overlap_pct"],
            "detour_km": scenario["detour_km"],
            "distance_km": distance_km,
            "same_transport_mode": 1,
            "destination_distance_km": scenario["destination_distance_km"],
            "seats_available": scenario["seats_available"],
            "max_detour_km": 5,
            "max_time_difference_min": 120,
        }
        body = client.post("/predict", json=payload).json()
        assert body["distance_feature_miles"] == scenario["distance_miles"], name
        assert body["constraints"]["eligible"] is scenario["expect_eligible"], name
        assert body["prediction"] == scenario["expect_prediction"], name
        assert body["match_probability"] == scenario["expect_probability"], name
        if scenario["time_difference_min"] > 45:
            assert body["in_distribution"] is False, name
        else:
            assert body["in_distribution"] is True, name


def test_sklearn_guard_names_a_mismatched_version(monkeypatch):
    monkeypatch.setattr(ml_api.sklearn, "__version__", "1.8.0", raising=False)
    message = ml_api.sklearn_guard()
    assert message is not None
    assert "1.8.0" in message
    assert "1.9.1" in message


def test_predict_reports_a_version_refusal(monkeypatch):
    monkeypatch.setattr(ml_api, "MODEL", None)
    monkeypatch.setattr(ml_api, "LOAD_ERROR", "scikit-learn 1.8.0 does not match the model training version 1.9.1.")
    response = client.post("/predict", json=VALID)
    assert response.status_code == 503
    assert "1.9.1" in response.json()["detail"]


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


def test_reverse_uses_provider_results(monkeypatch):
    monkeypatch.setattr(ml_api, "enforce_rate", lambda *args, **kwargs: None)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"display_name": "DSU Innovation Campus, Bengaluru"}

    monkeypatch.setattr(ml_api.httpx, "get", lambda *args, **kwargs: FakeResponse())
    response = client.get("/geo/reverse", params={"lat": 12.89, "lng": 77.64})
    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "DSU Innovation Campus, Bengaluru"
    assert body["lat"] == 12.89
    assert body["lng"] == 77.64


def test_route_returns_geometry(monkeypatch):
    monkeypatch.setattr(ml_api, "enforce_rate", lambda *args, **kwargs: None)

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "code": "Ok",
                "routes": [{
                    "distance": 4200,
                    "duration": 600,
                    "geometry": {"coordinates": [[77.61, 12.93], [77.64, 12.89]]},
                }],
            }

    monkeypatch.setattr(ml_api.httpx, "get", lambda *args, **kwargs: FakeResponse())
    response = client.post("/geo/route", json={
        "origin_lat": 12.93,
        "origin_lng": 77.61,
        "destination_lat": 12.89,
        "destination_lng": 77.64,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["distance_km"] == 4.2
    assert body["duration_min"] == 10.0
    assert body["geometry"][0] == [12.93, 77.61]


def test_parse_cors_keeps_localhost_and_adds_production_urls():
    origins = ml_api.parse_cors_origins(
        "https://yaana.example.com, https://www.yaana.app/"
    )
    assert "http://localhost:5173" in origins
    assert "http://127.0.0.1:5173" in origins
    assert "https://yaana.example.com" in origins
    assert "https://www.yaana.app" in origins
    assert "*" not in origins


def test_parse_cors_ignores_wildcard_and_non_urls():
    origins = ml_api.parse_cors_origins("*, ftp://bad.example, yaana.example.com")
    assert "*" not in origins
    assert "ftp://bad.example" not in origins
    assert "yaana.example.com" not in origins
    assert "http://localhost:5173" in origins


def test_cors_allows_localhost_origin():
    response = client.get("/", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_allows_configured_production_origin():
    origin = "https://yaana.example.com"
    added = origin not in ml_api.ALLOWED_ORIGINS
    if added:
        ml_api.ALLOWED_ORIGINS.append(origin)
    try:
        response = client.get("/", headers={"Origin": origin})
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == origin
    finally:
        if added:
            ml_api.ALLOWED_ORIGINS.remove(origin)


def test_cors_rejects_unknown_origin():
    response = client.get("/", headers={"Origin": "https://unknown.example"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") != "https://unknown.example"


def test_cors_preflight_allows_localhost_post():
    response = client.options(
        "/predict",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
