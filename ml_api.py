
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "yaana_model.joblib"

saved = joblib.load(MODEL_PATH)
model = saved["model"]
features = saved["features"]

app = FastAPI(title="YAANA Match Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TripFeatures(BaseModel):
    time_difference_min: int = Field(ge=0, le=1440)
    route_overlap_pct: float = Field(ge=0, le=100)
    detour_km: float = Field(ge=0, le=100)
    distance_km: float = Field(gt=0, le=500)
    same_transport_mode: int = Field(ge=0, le=1)
    destination_distance_km: float = Field(ge=0, le=500)


@app.get("/")
def home():
    return {
        "app": "YAANA Match Intelligence",
        "status": "running",
        "model": "Random Forest Classifier",
    }


@app.post("/predict")
def predict(trip: TripFeatures):
    data = pd.DataFrame(
        [trip.model_dump()],
        columns=features,
    )

    probabilities = model.predict_proba(data)[0]
    classes = list(model.classes_)
    probability = (
        float(probabilities[classes.index(1)])
        if 1 in classes else 0.0
    )

    prediction = int(model.predict(data)[0])

    return {
        "prediction": prediction,
        "match_probability": round(probability, 4),
        "match_percentage": round(probability * 100, 2),
        "message": (
            "Potential match"
            if prediction == 1
            else "Not a recommended match"
        ),
    }
