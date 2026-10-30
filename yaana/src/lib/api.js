const BASE = (import.meta.env.VITE_ML_API_URL || "http://localhost:8000").replace(/\/$/, "");

function detailMessage(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Check the trip details.").join(" ");
  }
  return "The map service could not complete that request.";
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch {
    const error = new Error("The map and matching service is not running.");
    error.status = 0;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(detailMessage(body.detail));
    error.status = response.status;
    throw error;
  }
  return body;
}

export function searchPlaces(query) {
  return api(`/geo/search?q=${encodeURIComponent(query)}`);
}

export function reversePlace(lat, lng) {
  return api(`/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
}

export function fetchRoute(origin, destination) {
  return api("/geo/route", {
    method: "POST",
    body: JSON.stringify({
      origin_lat: origin[0],
      origin_lng: origin[1],
      destination_lat: destination[0],
      destination_lng: destination[1],
    }),
  });
}

export function fetchDetour(payload) {
  return api("/geo/detour", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function predictMatch(payload) {
  return api("/predict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
