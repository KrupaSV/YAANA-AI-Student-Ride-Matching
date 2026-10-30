import hashlib
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline

from ml.preprocess import ColumnOrderTransformer

DATASET = Path(__file__).resolve().parent / "data" / "chicago_tnp_pairs.csv"
MODEL_PATH = Path(__file__).resolve().parents[1] / "yaana_model.joblib"
METRICS_PATH = Path(__file__).resolve().parent / "metrics.json"
DATA_NOTE = (
    "This score comes from a Random Forest trained on real Chicago rideshare trips published by the City of Chicago. "
    "A pair is labeled shareable when the recorded pickups are within 0.8 km, the drop-offs within 1 km, and the starts within 30 minutes. "
    "The city file does not say which two riders shared a car, and these trips are not DSU commutes."
)

FEATURES = [
    "time_difference_min",
    "route_overlap_pct",
    "detour_km",
    "distance_km",
    "same_transport_mode",
    "destination_distance_km",
]


def metric_block(y_true, y_pred, y_prob):
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4) if len(set(y_true)) == 2 else None,
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "classification_report": classification_report(y_true, y_pred, zero_division=0, output_dict=True),
    }


def trip_bucket(trip_id):
    digest = hashlib.md5(str(trip_id).encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 10


def split_name(bucket):
    if bucket <= 5:
        return "train"
    if bucket <= 7:
        return "val"
    return "test"


def split_frame(df):
    """Keep a pair only when both real trip ids fall in the same split."""
    names = []
    for trip_a, trip_b in zip(df["trip_a"], df["trip_b"]):
        left = split_name(trip_bucket(trip_a))
        right = split_name(trip_bucket(trip_b))
        names.append(left if left == right else "cross")
    return names


def main():
    if not DATASET.exists():
        raise SystemExit("Real pair file is missing. Run: python -m ml.build_real_dataset")
    df = pd.read_csv(DATASET)
    if "match_label" not in df.columns or "trip_a" not in df.columns:
        raise SystemExit("chicago_tnp_pairs.csv is missing trip ids or match_label")
    leaked = [column for column in FEATURES if column == "match_label"]
    if leaked:
        raise SystemExit("Label leaked into features")

    df = df.copy()
    df["split"] = split_frame(df)
    usable = df[df["split"] != "cross"]
    if usable["split"].nunique() < 3 or usable["match_label"].nunique() < 2:
        raise SystemExit("Grouped split did not leave train, validation, and test rows for both classes.")

    X_train = usable.loc[usable["split"] == "train", FEATURES]
    y_train = usable.loc[usable["split"] == "train", "match_label"].astype(int)
    X_val = usable.loc[usable["split"] == "val", FEATURES]
    y_val = usable.loc[usable["split"] == "val", "match_label"].astype(int)
    X_test = usable.loc[usable["split"] == "test", FEATURES]
    y_test = usable.loc[usable["split"] == "test", "match_label"].astype(int)

    pipeline = Pipeline([
        ("columns", ColumnOrderTransformer(FEATURES)),
        ("forest", RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=42,
        )),
    ])
    pipeline.fit(X_train, y_train)

    def evaluate(frame, labels):
        predictions = pipeline.predict(frame)
        probabilities = pipeline.predict_proba(frame)[:, 1]
        return metric_block(labels, predictions, probabilities)

    validation = evaluate(X_val, y_val)
    test = evaluate(X_test, y_test)
    metrics = {
        "dataset": DATASET.name,
        "source": "City of Chicago Transportation Network Providers - Trips, 2019-10-25",
        "rows": int(len(df)),
        "rows_used_after_grouped_split": int(len(usable)),
        "synthetic": False,
        "label": DATA_NOTE,
        "split": {
            "train": int(len(X_train)),
            "validation": int(len(X_val)),
            "test": int(len(X_test)),
            "crossed_pairs_held_out": int((df["split"] == "cross").sum()),
        },
        "grouping": "A pair is used only when both City of Chicago trip ids fall in the same split, so one trip is not scored in train and test.",
        "validation": validation,
        "test": test,
        "warning": DATA_NOTE,
    }

    joblib.dump({
        "pipeline": pipeline,
        "model": pipeline.named_steps["forest"],
        "features": FEATURES,
        "metrics": metrics,
        "data_note": metrics["warning"],
    }, MODEL_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(json.dumps({
        "model_path": str(MODEL_PATH),
        "validation": {key: validation[key] for key in ("accuracy", "precision", "recall", "f1", "roc_auc", "confusion_matrix")},
        "test": {key: test[key] for key in ("accuracy", "precision", "recall", "f1", "roc_auc", "confusion_matrix")},
    }, indent=2))


if __name__ == "__main__":
    main()
