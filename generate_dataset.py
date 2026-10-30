import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
n = 2000

df = pd.DataFrame({
    "time_difference_min": rng.integers(0, 121, n),
    "route_overlap_pct": rng.uniform(0, 100, n),
    "detour_km": rng.uniform(0, 15, n),
    "distance_km": rng.uniform(1, 30, n),
    "same_transport_mode": rng.integers(0, 2, n),
    "destination_distance_km": rng.uniform(0, 20, n),
})

score = (
    0.40 * df["route_overlap_pct"] / 100
    + 0.25 * np.exp(-df["time_difference_min"] / 30)
    + 0.15 * np.exp(-df["detour_km"] / 3)
    + 0.10 * df["same_transport_mode"]
    + 0.10 * np.exp(-df["destination_distance_km"] / 4)
)

df["match_label"] = (score >= 0.55).astype(int)
df.to_csv("yaana_synthetic_dataset.csv", index=False)

print("Dataset created successfully!")
print("Total records:", len(df))
print(df["match_label"].value_counts())
