import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import TravelMap from "./TravelMap";
import LocationSearch from "./LocationSearch";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";
import { useAuth } from "../lib/auth";
import { supabase, friendlyError, fmtDate } from "../lib/supabase";
import { haversineKm, openSeats, TRANSPORT_MODES } from "../lib/matching";

const emptyDraft = {
  pickup: null,
  pickupQuery: "",
  destination: null,
  destQuery: "",
  window: "any",
  mode: "all",
  detour: "any",
  seats: "0",
};

const tricks = [
  {
    tone: "peach",
    emoji: "📬",
    kicker: "Little rule",
    title: "A send is not a seat.",
    body: "The owner still has to accept. Wait for that yes before you leave.",
  },
  {
    tone: "sage",
    emoji: "🗺️",
    kicker: "Cute trap",
    title: "Same area ≠ same road.",
    body: "Matching reads saved geometry. A nearby pin is not enough.",
  },
  {
    tone: "sky",
    emoji: "🫧",
    kicker: "Honest board",
    title: "Empty means empty.",
    body: "If nobody posted your hop, be first. YAANA will not invent a ride.",
  },
  {
    tone: "pink",
    emoji: "⏰",
    kicker: "Late-lab trick",
    title: "Cancel if you cannot make it.",
    body: "Trips returns an accepted seat after cancel succeeds. Tell the road, then go.",
  },
];

function placePoint(place) {
  if (!place) return null;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function usesPlace(place, query) {
  if (!place) return false;
  const typed = (query || "").trim();
  return !typed || typed === place.label;
}

function isChicagoCoordinate(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return latitude >= 41.6 && latitude <= 42.1 && longitude >= -88.0 && longitude <= -87.5;
}

function isAvailableStudentTrip(trip) {
  if (!trip?.id) return false;
  if (trip.is_chicago || trip.is_demo) return false;
  if (String(trip.id).startsWith("chi-")) return false;
  if (trip.status !== "open") return false;
  if (isChicagoCoordinate(trip.origin_lat, trip.origin_lng)) return false;
  if (isChicagoCoordinate(trip.destination_lat, trip.destination_lng)) return false;
  const departure = new Date(trip.departure_at).getTime();
  if (!Number.isFinite(departure) || departure <= Date.now()) return false;
  return openSeats(trip) > 0;
}

function filterTrips(trips, filters) {
  const pickupText = (filters.pickupQuery || filters.pickup?.label || "").trim().toLowerCase();
  const destText = (filters.destQuery || filters.destination?.label || "").trim().toLowerCase();
  const pickupPoint = usesPlace(filters.pickup, filters.pickupQuery) ? placePoint(filters.pickup) : null;
  const destPoint = usesPlace(filters.destination, filters.destQuery) ? placePoint(filters.destination) : null;
  const minSeats = Number(filters.seats) || 0;
  const now = Date.now();

  return trips.filter((trip) => {
    if (filters.mode !== "all" && trip.transport_mode !== filters.mode) return false;
    if (openSeats(trip) < minSeats) return false;

    const departure = new Date(trip.departure_at).getTime();
    if (!Number.isFinite(departure) || departure <= now) return false;
    if (filters.window === "24h" && departure > now + 24 * 60 * 60 * 1000) return false;
    if (filters.window === "7d" && departure > now + 7 * 24 * 60 * 60 * 1000) return false;
    const hour = new Date(trip.departure_at).getHours();
    if (filters.window === "morning" && (hour < 5 || hour >= 12)) return false;
    if (filters.window === "afternoon" && (hour < 12 || hour >= 17)) return false;
    if (filters.window === "evening" && hour < 17) return false;

    if (pickupPoint) {
      const distance = haversineKm([trip.origin_lat, trip.origin_lng], pickupPoint);
      if (distance == null || distance > 4) return false;
    } else if (pickupText && !String(trip.origin_name || "").toLowerCase().includes(pickupText)) {
      return false;
    }

    if (destPoint) {
      const distance = haversineKm([trip.destination_lat, trip.destination_lng], destPoint);
      if (distance == null) return false;
      const limit = filters.detour === "any" ? 8 : Number(filters.detour);
      if (!Number.isFinite(limit) || distance > limit) return false;
    } else if (destText && !String(trip.destination_name || "").toLowerCase().includes(destText)) {
      return false;
    }

    return true;
  });
}

export default function ExploreBoard() {
  const { session, verified, loading: authLoading, configured } = useAuth();
  const [trips, setTrips] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterKey, setFilterKey] = useState(0);
  const canReadTrips = Boolean(configured && session && verified);

  const load = useCallback(async () => {
    if (!configured) {
      setError("YAANA is not connected to a database.");
      setTrips([]);
      setLoading(false);
      return;
    }
    if (!session || !verified) {
      setTrips([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("trips")
      .select("*")
      .eq("status", "open")
      .gt("departure_at", new Date().toISOString())
      .order("departure_at", { ascending: true })
      .limit(100);
    if (queryError) {
      setError(friendlyError(queryError));
      setTrips([]);
    } else {
      setTrips((data || []).filter(isAvailableStudentTrip));
    }
    setLoading(false);
  }, [configured, session, verified]);

  useEffect(() => {
    if (authLoading) return undefined;
    load();
    return undefined;
  }, [authLoading, load]);

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function search(event) {
    event?.preventDefault();
    setSelectedId("");
    load();
  }

  function reset() {
    setDraft(emptyDraft);
    setSelectedId("");
    setFilterKey((key) => key + 1);
    load();
  }

  const filtered = useMemo(() => filterTrips(trips, draft), [trips, draft]);
  const selected = filtered.find((trip) => trip.id === selectedId) || null;

  const mapSource = selected
    ? filtered.filter((trip) => haversineKm([trip.origin_lat, trip.origin_lng], [selected.origin_lat, selected.origin_lng]) < 30)
    : filtered;
  const listings = mapSource.slice(0, 80).map((trip) => ({
    id: trip.id,
    lat: trip.origin_lat,
    lng: trip.origin_lng,
    destination: [trip.destination_lat, trip.destination_lng],
    label: `${trip.origin_name} → ${trip.destination_name}`,
    seats: openSeats(trip),
    time: fmtDate(trip.departure_at),
    selected: selected?.id === trip.id,
  }));

  const findTo = session ? "/find-rides" : "/login";
  const createTo = session ? "/create-trip" : "/register";
  const signedOut = !authLoading && (!session || !verified);
  const ready = canReadTrips && !loading && !error;

  function renderRail() {
    if (authLoading || loading) return <Skeleton rows={3} />;
    if (error) return <p className="alert alert-error" role="alert">{error}</p>;
    if (signedOut) {
      return (
        <EmptyState
          eyebrow="Explore"
          title="Sign in to load published trips."
          body="Nothing here is invented to fill the map."
          to="/login"
          action="Log in to explore"
        />
      );
    }
    if (ready && trips.length === 0) {
      return (
        <EmptyState
          eyebrow="Explore"
          title="No published trips to show."
          body="Nothing here is invented to fill the map."
        />
      );
    }
    if (ready && filtered.length === 0) {
      return (
        <EmptyState
          eyebrow="Explore"
          title="No rides match these filters."
          body="Try another destination, time window, or transport mode."
        />
      );
    }
    return (
      <ul className="explore-hits">
        {filtered.map((trip) => (
          <li key={trip.id}>
            <button
              type="button"
              className={`explore-hit${selected?.id === trip.id ? " is-selected" : ""}`}
              aria-pressed={selected?.id === trip.id}
              onClick={() => setSelectedId(trip.id)}
            >
              <span className="explore-hit-seats">{openSeats(trip)}</span>
              <strong>{trip.origin_name} → {trip.destination_name}</strong>
              <p>
                {fmtDate(trip.departure_at)}
                {" · "}
                {trip.transport_mode || "Mode unset"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="explore-studio">
      <ul className="explore-tricks">
        {tricks.map((trick) => (
          <li key={trick.title} className={`explore-trick explore-trick-${trick.tone}`}>
            <p className="eyebrow"><span className="peek" aria-hidden="true">{trick.emoji}</span> {trick.kicker}</p>
            <h3>{trick.title}</h3>
            <p>{trick.body}</p>
          </li>
        ))}
      </ul>

      <div className="explore-pocket">
        <div className="explore-map-stage">
          <span className="map-doodle map-doodle-auto" aria-hidden="true">🛺</span>
          <span className="map-chip map-chip-go" aria-hidden="true">Same roads</span>
          <div className="explore-map">
            <p className="explore-map-sticker" aria-hidden="true">Peek the roads</p>
            <TravelMap
              compact
              quiet
              preview={false}
              origin={selected ? [selected.origin_lat, selected.origin_lng] : null}
              destination={selected ? [selected.destination_lat, selected.destination_lng] : null}
              route={selected?.route_geometry || []}
              originLabel={selected?.origin_name}
              destinationLabel={selected?.destination_name}
              distanceKm={selected?.distance_km}
              durationMin={selected?.duration_min}
              transportMode={selected?.transport_mode}
              selected={Boolean(selected)}
              listings={listings}
              onSelectListing={setSelectedId}
              emptyHint="Published student trips appear here when they are open."
            />
          </div>
        </div>

        <div className="explore-side">
          <form className="explore-dock" onSubmit={search}>
            <LocationSearch
              key={`pickup-${filterKey}`}
              label="Pickup"
              placeholder="Search a pickup"
              value={draft.pickup}
              onSelect={(place) => updateDraft({ pickup: place, pickupQuery: place?.label || "" })}
              onQuery={(query) => updateDraft({ pickupQuery: query })}
            />
            <LocationSearch
              key={`destination-${filterKey}`}
              label="Drop"
              placeholder="Search a drop"
              value={draft.destination}
              onSelect={(place) => updateDraft({ destination: place, destQuery: place?.label || "" })}
              onQuery={(query) => updateDraft({ destQuery: query })}
            />
            <label className="field">
              <span>When</span>
              <select
                value={draft.window}
                aria-label="Departure window"
                onChange={(event) => updateDraft({ window: event.target.value })}
              >
                <option value="any">Any upcoming</option>
                <option value="24h">Next 24 hours</option>
                <option value="7d">Next 7 days</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>
            <div className="explore-modes" role="group" aria-label="Transport mode">
              <button
                type="button"
                className={draft.mode === "all" ? "is-on" : ""}
                aria-pressed={draft.mode === "all"}
                onClick={() => updateDraft({ mode: "all" })}
              >
                Any
              </button>
              {TRANSPORT_MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={draft.mode === item ? "is-on" : ""}
                  aria-pressed={draft.mode === item}
                  onClick={() => updateDraft({ mode: item })}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="explore-actions">
              <button className="btn btn-primary" type="submit">Search</button>
              <button className="btn btn-secondary" type="button" onClick={reset}>Reset</button>
            </div>
          </form>

          <div className="explore-rail">
            {renderRail()}
          </div>
        </div>
      </div>

      <div className="explore-cta">
        <Link className="btn btn-ink" to={findTo}>Find actual rides <ArrowRight size={15} /></Link>
        <Link className="btn btn-secondary" to={createTo}>Create a trip</Link>
      </div>
    </div>
  );
}
