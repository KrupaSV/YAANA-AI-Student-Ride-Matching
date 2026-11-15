import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { fetchRoute, reversePlace } from "../lib/api";
import { TRANSPORT_MODES } from "../lib/matching";
import { DESTINATION_SYMBOL, pickupCharacter } from "../lib/mapCharacters";
import { loadOpenStudentTrips, syncMatchesForTrip } from "../lib/syncMatches";
import { useTitle } from "../lib/useTitle";
import MapPicker from "../components/MapPicker";
import LocationSearch from "../components/LocationSearch";
import PageBanner from "../components/PageBanner";

const pinOptions = [
  { target: "pickup", label: "Pickup" },
  { target: "destination", label: "Destination" },
];

export default function CreateTrip() {
  useTitle("Create a trip");
  const { user, profile, verified } = useAuth();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pinTarget, setPinTarget] = useState("pickup");
  const [fitKey, setFitKey] = useState(0);
  const [routeResult, setRouteResult] = useState(null);
  const [routeRetry, setRouteRetry] = useState(0);
  const pickupVersion = useRef(0);
  const [departure, setDeparture] = useState("");
  const [mode, setMode] = useState("Auto");
  const [modeTouched, setModeTouched] = useState(false);
  const [seats, setSeats] = useState(1);
  const [cost, setCost] = useState(0);
  const [preferences, setPreferences] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [geoNote, setGeoNote] = useState("");
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;
  const routeKey = origin && destination
    ? [originLat, originLng, destinationLat, destinationLng, routeRetry].join(",")
    : "";
  const currentResult = routeKey && routeResult?.key === routeKey ? routeResult : null;
  const currentRoute = currentResult?.route;
  const routing = Boolean(routeKey && !currentResult);
  const targetLabel = pinTarget === "pickup" ? "pickup" : "destination";
  const activePlace = pinTarget === "pickup" ? origin : destination;

  useEffect(() => {
    if (!modeTouched && profile?.transport_preference && profile.transport_preference !== "Any") {
      setMode(profile.transport_preference);
    }
  }, [modeTouched, profile?.transport_preference]);

  useEffect(() => {
    if (!routeKey) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    let timer = setTimeout(() => loadRoute(), 300);

    async function loadRoute(retried = false) {
      try {
        const route = await fetchRoute([originLat, originLng], [destinationLat, destinationLng], signal);
        if (!Array.isArray(route.geometry) || route.geometry.length < 2
          || !Number.isFinite(route.distance_km) || !Number.isFinite(route.duration_min)) {
          throw new Error("The routing service did not return a road route.");
        }
        if (!signal.aborted) setRouteResult({ key: routeKey, route });
      } catch (err) {
        if (signal.aborted) return;
        if (err.status === 429 && !retried) {
          timer = setTimeout(() => loadRoute(true), 1100);
          return;
        }
        setRouteResult({ key: routeKey, error: err.message || "The routing service could not draw this route." });
      }
    }

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [routeKey, originLat, originLng, destinationLat, destinationLng]);

  function choosePlace(target, place, recenter = false) {
    const isPickup = target === "pickup";
    const otherPlace = isPickup ? destination : origin;
    if (isPickup) pickupVersion.current += 1;
    (isPickup ? setOrigin : setDestination)(place);
    setError("");
    setGeoNote("");
    if (!place) return;
    if (recenter) setFitKey((key) => key + 1);
    setPinTarget((current) => {
      if (current !== target && (current || otherPlace)) return current;
      return otherPlace ? null : isPickup ? "destination" : "pickup";
    });
  }

  async function namePoint(target, [lat, lng], recenter = false) {
    const setPlace = target === "pickup" ? setOrigin : setDestination;
    const point = { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
    choosePlace(target, point, recenter);
    try {
      const place = await reversePlace(lat, lng);
      setPlace((current) => current === point ? { ...point, label: place.label } : current);
    } catch {
      // Keep the coordinates as the label when naming is unavailable.
    }
  }

  async function locate() {
    setGeoNote("");
    if (!navigator.geolocation) {
      setGeoNote("This browser cannot share your location. Search for the pickup instead.");
      return;
    }
    const request = ++pickupVersion.current;
    navigator.geolocation.getCurrentPosition((position) => {
      if (request === pickupVersion.current) {
        namePoint("pickup", [position.coords.latitude, position.coords.longitude], true);
      }
    }, () => {
      if (request === pickupVersion.current) setGeoNote("Couldn’t get your location. Search for a place or use a map pin.");
    }, { enableHighAccuracy: false, timeout: 8000 });
  }

  async function publish(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!verified) {
      setError("Confirm your DSU email before creating a trip. A matching domain alone is not enough.");
      return;
    }
    if (!origin || !destination) {
      setError("Choose both a pickup and a destination.");
      return;
    }
    if (!currentRoute) {
      setError("Wait for the driving route before publishing.");
      return;
    }
    const when = new Date(departure);
    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      setError("Choose a departure time in the future.");
      return;
    }
    setSaving(true);
    const { data: saved, error: insertError } = await supabase.from("trips").insert({
      user_id: user.id,
      origin_name: origin.label,
      destination_name: destination.label,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      departure_at: when.toISOString(),
      transport_mode: mode,
      seats_available: Number(seats),
      estimated_cost: Number(cost) || 0,
      status: "open",
      preferences: preferences.trim() || null,
      route_geometry: currentRoute.geometry,
      distance_km: currentRoute.distance_km,
      duration_min: currentRoute.duration_min,
      owner_display_name: profile?.full_name || null,
    }).select("*").single();
    if (insertError) {
      setSaving(false);
      setError(friendlyError(insertError));
      return;
    }
    const loaded = await loadOpenStudentTrips(user.id);
    const matched = saved ? await syncMatchesForTrip(saved, loaded.others || []) : { created: 0 };
    setSaving(false);
    setMessage(matched.created ? "Trip saved. A compatible classmate was found." : "Trip saved. YAANA will keep looking for compatible classmates.");
    navigate("/matches", { replace: true, state: { published: true, created: matched.created || 0 } });
  }

  return (
    <>
      <PageBanner
        tone="tangerine"
        eyebrow="Create a trip"
        title="Publish a trip."
        lede="Choose a pickup and destination by searching or placing pins on the map."
      />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {geoNote && <p className="alert alert-info" role="status">{geoNote}</p>}
      <form className="split trip-form" onSubmit={publish}>
        <div className="stack trip-place-fields">
          <LocationSearch label="Pickup" placeholder="Search Bengaluru places" value={origin} onSelect={(place) => choosePlace("pickup", place, true)} onQuery={() => choosePlace("pickup", null)} />
          <LocationSearch label="Destination" placeholder="Search Bengaluru places" value={destination} onSelect={(place) => choosePlace("destination", place, true)} onQuery={() => choosePlace("destination", null)} />
          <button className="btn btn-secondary" type="button" onClick={locate}>Use my location for pickup</button>
        </div>
        <section className="trip-map" aria-label="Place trip pins">
          <div className="pin-tools" role="group" aria-label="Choose a pin to place">
            {pinOptions.map(({ target, label }) => {
              const placed = target === "pickup" ? origin : destination;
              return (
                <button
                  className={`pin-tool pin-tool-${target}`}
                  key={target}
                  type="button"
                  aria-pressed={pinTarget === target}
                  onClick={() => setPinTarget((current) => current === target ? null : target)}
                >
                  <span className="pin-tool-mark" aria-hidden="true">
                    {target === "pickup" ? pickupCharacter(profile?.pickup_character).symbol : DESTINATION_SYMBOL}
                  </span>
                  <span>{label}<small>{placed ? "Pin set" : "No pin yet"}</small></span>
                </button>
              );
            })}
          </div>
          <p className="pin-instruction" role="status">
            {pinTarget
              ? <><strong>{activePlace ? "Move" : "Place"} {targetLabel}.</strong> Click or tap the map, or use its center.</>
              : origin && destination
                ? "Drag either pin to adjust it, or select a pin to place it again."
                : "Select Pickup or Destination to place a pin."}
          </p>
          <MapPicker
            origin={origin}
            originCharacter={profile?.pickup_character}
            destination={destination}
            route={currentRoute?.geometry}
            fitKey={fitKey}
            centerLabel={`Pin ${targetLabel} at center`}
            onPick={pinTarget ? (point) => namePoint(pinTarget, point) : undefined}
            onMovePin={namePoint}
            onTileError={() => setTileError(true)}
            quiet
          />
          {tileError && <p className="field-note">Some map tiles didn’t load. You can still search for a place.</p>}
          {routing && <p className="field-note" role="status">Calculating the driving route…</p>}
          {currentRoute && (
            <p className="field-note" role="status">Driving route · {currentRoute.distance_km} km · about {Math.round(currentRoute.duration_min)} min</p>
          )}
          {currentResult?.error && (
            <div className="alert alert-error">
              <span role="alert">{currentResult.error}</span>
              <button className="btn btn-secondary" type="button" onClick={() => setRouteRetry((attempt) => attempt + 1)}>Retry route</button>
            </div>
          )}
        </section>
        <div className="stack trip-details">
          <label className="field">
            <span>Departure</span>
            <input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} required />
          </label>
          <div className="pair">
            <label className="field">
              <span>Travel mode</span>
              <select value={mode} onChange={(event) => { setModeTouched(true); setMode(event.target.value); }}>
                {TRANSPORT_MODES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Seats you can offer</span>
              <select value={seats} onChange={(event) => setSeats(event.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((seat) => <option key={seat} value={seat}>{seat}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Optional cost per person (₹)</span>
            <input type="number" min="0" step="1" value={cost} onChange={(event) => setCost(event.target.value)} />
          </label>
          <label className="field">
            <span>Optional note</span>
            <textarea maxLength="280" value={preferences} placeholder="Bag space, a short stop, or anything classmates should know. Leave out phone numbers." onChange={(event) => setPreferences(event.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={saving || !currentRoute || !verified}>{saving ? "Saving…" : "Publish trip"}</button>
        </div>
      </form>
    </>
  );
}
