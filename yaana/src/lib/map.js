import { fetchRoute } from "./api";
import { simplifyRoute } from "./matching";

export const DEFAULT_CENTER = [12.9345, 77.6055];
export const DEFAULT_ZOOM = 13;

export const EXAMPLE_PICKUP = {
  lat: 12.9345,
  lng: 77.6055,
  label: "Example pickup",
};

export const EXAMPLE_DROP = {
  lat: 12.891,
  lng: 77.641,
  label: "Example destination",
};

let exampleCache;
let exampleRequest;

export function asLatLng(value) {
  if (!value) return null;
  if (Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    return [Number(value[0]), Number(value[1])];
  }
  if (value.position) return asLatLng(value.position);
  if (Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng))) {
    return [Number(value.lat), Number(value.lng)];
  }
  return null;
}

export function asRoute(value) {
  if (!Array.isArray(value)) return [];
  return value.map(asLatLng).filter(Boolean);
}

export function loadExampleRoute() {
  if (exampleCache) return Promise.resolve(exampleCache);
  if (!exampleRequest) {
    exampleRequest = fetchRoute(
      [EXAMPLE_PICKUP.lat, EXAMPLE_PICKUP.lng],
      [EXAMPLE_DROP.lat, EXAMPLE_DROP.lng],
    )
      .then((body) => {
        const geometry = simplifyRoute(body.geometry);
        exampleCache = {
          ok: geometry.length > 1,
          geometry,
          distanceKm: body.distance_km,
          durationMin: body.duration_min,
          provider: body.provider || "OSRM",
          error: geometry.length > 1 ? "" : "The routing service returned no road geometry.",
        };
        return exampleCache;
      })
      .catch((err) => {
        exampleCache = {
          ok: false,
          geometry: [],
          distanceKm: null,
          durationMin: null,
          provider: "",
          error: err.message || "The routing service is not available.",
        };
        exampleRequest = null;
        return exampleCache;
      });
  }
  return exampleRequest;
}
