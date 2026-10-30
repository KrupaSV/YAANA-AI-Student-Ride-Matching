import { fetchRoute } from "./api";
import { simplifyRoute } from "./matching";

export const DEFAULT_CENTER = [12.89, 77.64];
export const DEFAULT_ZOOM = 12;

export const EXAMPLE_PICKUP = {
  lat: 41.87887,
  lng: -87.62519,
  label: "The Loop",
};

export const EXAMPLE_DROP = {
  lat: 41.92269,
  lng: -87.64949,
  label: "Lincoln Park",
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

export function placeFromQuery(query) {
  const text = String(query || "").trim();
  const match = text.match(/^(.*?)[(\[]?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*[)\]]?\s*$/);
  if (!match) return null;
  const lat = Number(match[2]);
  const lng = Number(match[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 1 && Math.abs(lng) < 1) return null;
  const name = match[1].replace(/[\s(\[]+$/g, "").trim();
  return {
    label: name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
  };
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
        exampleRequest = null;
        return {
          ok: false,
          geometry: [],
          distanceKm: null,
          durationMin: null,
          provider: "",
          error: err.message || "The routing service is not available.",
        };
      });
  }
  return exampleRequest;
}
