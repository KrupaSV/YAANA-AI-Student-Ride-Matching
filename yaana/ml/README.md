# YAANA machine-learning pipeline

The classifier is a scikit-learn Random Forest trained on real rideshare trips from the City of Chicago open data, not on made-up feature rows and not on DSU commutes.

## Dataset

- Source: [Transportation Network Providers - Trips](https://data.cityofchicago.org/Transportation/Transportation-Network-Providers-Trips/m6dm-c72p), 25 October 2019, 16:00–17:15.
- Raw file: `ml/data/chicago_tnp_trips.csv` (7,619 trips with recorded pickup, drop-off, miles, and start time).
- Pair file: `ml/data/chicago_tnp_pairs.csv` (4,000 shareable pairs and 4,000 non-shareable pairs).
- Rebuild with `python -m ml.build_real_dataset` from the `yaana` folder.
- Label: shareable when recorded pickups are within 0.8 km, drop-offs within 1 km, and starts within 30 minutes. The city file does not publish which two trips actually shared a vehicle.
- Features: `time_difference_min`, `route_overlap_pct`, `detour_km`, `distance_km` (recorded miles, despite the name), `same_transport_mode`, `destination_distance_km`. Trip ids are used only to split the data. `match_label` is not a feature.
- Overlap and detour in training are measured on the straight line between the recorded pickup and drop-off. Live matching still uses the saved road line and OSRM for detour. Those two features stay in kilometres.
- `time_difference_min` in this file runs from 0 to 45. The API does not score a wider gap and does not shorten the gap to fit.
- Every training pair is rideshare, so `same_transport_mode` is 1 throughout this file. The live check for different modes is separate, and the saved model always receives 1.

## Install

Training and inference both use the project virtual environment, which has scikit-learn 1.9.1. `ml/requirements.txt` pins that release. The API refuses to load `yaana_model.joblib` when the installed scikit-learn is anything else.

From the project root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r yaana\ml\requirements.txt
```

## Train

```powershell
cd yaana
..\.venv\Scripts\python.exe -m ml.build_real_dataset
..\.venv\Scripts\python.exe -m ml.train_model
```

A pair is kept only when both Chicago trip ids fall in the same split (about 60% train, 20% validation, 20% test). This run used 2,641 train, 331 validation, and 436 test pairs. Cross-split pairs were left out. The forest is fit on the training split only. It saves `yaana/yaana_model.joblib` and `yaana/ml/metrics.json`.

Validation: accuracy 0.994, precision 0.9896, recall 1.0, F1 0.9948, ROC-AUC 0.9999. Confusion matrix `[[139, 2], [0, 190]]`.

Test: accuracy 0.9977, precision 0.9958, recall 1.0, F1 0.9979, ROC-AUC 0.9999. Confusion matrix `[[197, 1], [0, 238]]`.

Those scores are high because the label is a distance-and-time rule and the features include those measurements. They show that the forest recovers that rule on held-out Chicago trips. They are not proof that two DSU students will want to share a ride.

Hyperparameters: 200 trees, max depth 8, min samples per leaf 3, `class_weight="balanced"`, `random_state=42`.

## API

```powershell
cd yaana
..\.venv\Scripts\python.exe -m uvicorn ml_api:app --reload --port 8000
```

- `GET /` reports whether the model loaded and whether scikit-learn is 1.9.1.
- `POST /predict` expects `distance_km` in kilometres. Before the forest runs, that one field is divided by 1.60934 and rounded to 3 decimals so it matches the miles in `chicago_tnp_pairs.csv`. `detour_km` and `destination_distance_km` are not converted.
- The same request’s `same_transport_mode` is an eligibility check. The forest always receives 1, because that is the only value in the training file.
- A departure gap above 45 minutes returns `in_distribution: false` and null probability, prediction, and percentage. The submitted gap is not rewritten.
- Seats, detour, the optional time limit, and transport mode are reported separately from the Chicago rule score. A failed check does not erase an in-range score, and a score does not make a failed check eligible.
- `GET /geo/search`, `GET /geo/reverse`, `POST /geo/route`, and `POST /geo/detour` proxy Nominatim and the public OSRM demo. Each provider is limited to about one request per second. They can refuse traffic.

## Tests

```powershell
cd yaana
..\.venv\Scripts\python.exe -m pytest ml/tests/test_api.py -q
```

Latest run with the project virtual environment: `13 passed, 1 warning in 33.65s`. The warning is Starlette's deprecation notice about `httpx` and `TestClient`. It is not a failing test.
