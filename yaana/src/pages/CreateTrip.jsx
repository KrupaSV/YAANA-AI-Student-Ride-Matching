import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { fetchRoute, reversePlace } from "../lib/api";
import { simplifyRoute, TRANSPORT_MODES } from "../lib/matching";
import { useTitle } from "../lib/useTitle";
import MapPicker from "../components/MapPicker";
import LocationSearch from "../components/LocationSearch";
import PageBanner from "../components/PageBanner";

const emptyPlace = null;

export default function CreateTrip() {
  useTitle("Create a trip");
  const { user, profile, verified } = useAuth();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState(emptyPlace);
  const [destination, setDestination] = useState(emptyPlace);
  const [route, setRoute] = useState([]);
  const [distanceKm, setDistanceKm] = useState(null);
  const [durationMin, setDurationMin] = useState(null);
  const [departure, setDeparture] = useState("");
  const [mode, setMode] = useState("Auto");
  const [modeTouched, setModeTouched] = useState(false);
  const [seats, setSeats] = useState(1);
  const [cost, setCost] = useState(0);
  const [preferences, setPreferences] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [routing, setRouting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [geoNote, setGeoNote] = useState("");

  useEffect(() => {
    if (!modeTouched && profile?.transport_preference && profile.transport_preference !== "Any") {
      setMode(profile.transport_preference);
    }
  }, [modeTouched, profile?.transport_preference]);

  async function drawRoute(nextOrigin, nextDestination) {
    setRoute([]);
    setDistanceKm(null);
    setDurationMin(null);
    if (!nextOrigin || !nextDestination) return;
    setRouting(true);
    setError("");
    try {
      const body = await fetchRoute([nextOrigin.lat, nextOrigin.lng], [nextDestination.lat, nextDestination.lng]);
      setRoute(simplifyRoute(body.geometry));
      setDistanceKm(body.distance_km);
      setDurationMin(body.duration_min);
    } catch (err) {
      setError(err.message || "The routing service did not return a road route.");
    } finally {
      setRouting(false);
    }
  }

  async function locate() {
    setGeoNote("");
    if (!navigator.geolocation) {
      setGeoNote("This browser cannot share your location. Search for the pickup instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const place = await reversePlace(position.coords.latitude, position.coords.longitude);
        const next = { label: place.label, lat: place.lat, lng: place.lng };
        setOrigin(next);
        drawRoute(next, destination);
      } catch (err) {
        setGeoNote(err.message || "The current location could not be named.");
      }
    }, () => {
      setGeoNote("Location permission was denied. Search for a place instead.");
    }, { enableHighAccuracy: false, timeout: 8000 });
  }

  async function pin(point) {
    setGeoNote("");
    let label = "Pinned location";
    try {
      const place = await reversePlace(point[0], point[1]);
      label = place.label;
    } catch {
      setGeoNote("The pin was saved, but no place name came back.");
    }
    const place = { label, lat: point[0], lng: point[1] };
    if (!origin) {
      setOrigin(place);
      drawRoute(place, destination);
    } else {
      setDestination(place);
      drawRoute(origin, place);
    }
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
    if (!route.length || distanceKm == null) {
      setError("Wait for a road route before publishing. YAANA will not store a straight-line guess.");
      return;
    }
    const when = new Date(departure);
    if (Number.isNaN(when.getTime()) || when <= new Date()) {
      setError("Choose a departure time in the future.");
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from("trips").insert({
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
      route_geometry: route,
      distance_km: distanceKm,
      duration_min: durationMin,
      owner_display_name: profile?.full_name || null,
    });
    setSaving(false);
    if (insertError) setError(friendlyError(insertError));
    else {
      setMessage("Trip saved.");
      navigate("/trips", { replace: true, state: { saved: true } });
    }
  }

  return (
    <>
      <PageBanner
        tone="tangerine"
        eyebrow="Create a trip"
        title="Publish a trip."
        lede="Search for places or drop a pin. The route, distance, and time come from the driving service."
      />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {geoNote && <p className="alert alert-info" role="status">{geoNote}</p>}
      <form className="split" onSubmit={publish}>
        <div className="stack">
          <LocationSearch label="Pickup" placeholder="Search a pickup" value={origin} onSelect={(place) => { setOrigin(place); drawRoute(place, destination); }} />
          <LocationSearch label="Destination" placeholder="Search a destination" value={destination} onSelect={(place) => { setDestination(place); drawRoute(origin, place); }} />
          <button className="btn btn-secondary" type="button" onClick={locate}>Use my location for pickup</button>
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
          {distanceKm != null && <p className="alert alert-info" role="status">Driving route: {distanceKm} km, about {Math.round(durationMin)} minutes. This is the routing estimate, not a fare.</p>}
          {routing && <p role="status">Calculating the road route…</p>}
          <button className="btn btn-primary" disabled={saving || routing || !verified}>{saving ? "Saving…" : "Publish trip"}</button>
        </div>
        <MapPicker
          origin={origin && [origin.lat, origin.lng]}
          destination={destination && [destination.lat, destination.lng]}
          originLabel={origin?.label}
          destinationLabel={destination?.label}
          route={route}
          distanceKm={distanceKm}
          durationMin={durationMin}
          transportMode={mode}
          loading={routing}
          onPick={pin}
          tileError={tileError}
          onTileError={() => setTileError(true)}
        />
      </form>
    </>
  );
}
