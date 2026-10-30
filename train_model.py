import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report

df = pd.read_csv("yaana_synthetic_dataset.csv")

features = [
    "time_difference_min",
    "route_overlap_pct",
    "detour_km",
    "distance_km",
    "same_transport_mode",
    "destination_distance_km",
]

X = df[features]
y = df["match_label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=8,
    min_samples_leaf=3,
    class_weight="balanced",
    random_state=42,
)

model.fit(X_train, y_train)
predictions = model.predict(X_test)

print("Model training successful!")
print("Accuracy:", round(accuracy_score(y_test, predictions), 4))
print(classification_report(y_test, predictions, zero_division=0))

joblib.dump(
    {"model": model, "features": features},
    "yaana_model.joblib"
)

print("Saved model: yaana_model.joblib")
