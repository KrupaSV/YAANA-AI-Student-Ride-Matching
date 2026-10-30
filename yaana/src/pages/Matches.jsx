import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, fmtDate, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { fetchDetour, predictMatch } from "../lib/api";
import { explainMatch, MAX_TIME_DIFFERENCE_MIN, openSeats } from "../lib/matching";
import { CHICAGO_NOTICE, demoRequestSeat, isDemoRecord, mergeDemoTrips } from "../lib/demo";
import PageBanner from "../components/PageBanner";
import { useTitle } from "../lib/useTitle";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import MapPicker from "../components/MapPicker";

export default function Matches() {
  useTitle("Matches");
  const { user, profile, verified } = useAuth();
  const [mine, setMine] = useState([]);
  const [others, setOthers] = useState([]);
  const [selected, setSelected] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("overlap");

  useEffect(() => {
    let active = true;
    async function load() {
      const now = new Date().toISOString();
      const [myTrips, otherTrips] = await Promise.all([
        supabase.from("trips").select("*").eq("user_id", user.id).eq("status", "open").gt("departure_at", now),
        supabase.from("trips").select("*").in("status", ["open", "full"]).gt("departure_at", now).neq("user_id", user.id),
      ]);
      if (!active) return;
      if (myTrips.error || otherTrips.error) setError(friendlyError(myTrips.error || otherTrips.error));
      const all = mergeDemoTrips([...(myTrips.data || []), ...(otherTrips.data || [])], user.id, profile?.full_name);
      const myOpen = all.filter((trip) => trip.user_id === user.id && trip.status === "open" && new Date(trip.departure_at) > new Date());
      const otherOpen = all.filter((trip) => trip.user_id !== user.id && ["open", "full"].includes(trip.status) && new Date(trip.departure_at) > new Date());
      setMine(myOpen);
      setOthers(otherOpen);
      setSelected(myOpen[0]?.id || "");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [user.id, profile?.full_name]);

  useEffect(() => {
    const reference = mine.find((trip) => trip.id === selected);
    if (!reference) {
      setResults([]);
      return undefined;
    }
    let active = true;
    async function compare() {
      setComparing(true);
      setError("");
      const explained = others.map((trip) => ({ trip, facts: explainMatch(reference, trip) }))
        .sort((a, b) => (b.facts.overlap || 0) - (a.facts.overlap || 0));
      const checked = [];
      for (const item of explained.slice(0, 8)) {
        const next = { ...item, detour: null, score: null, serviceError: "" };
        if (!item.facts.comparable) {
          next.serviceError = "This trip has no saved road route, so overlap and detour cannot be calculated.";
          checked.push(next);
          continue;
        }
        try {
          const detour = await fetchDetour({
            origin_lat: reference.origin_lat,
            origin_lng: reference.origin_lng,
            pickup_lat: item.trip.origin_lat,
            pickup_lng: item.trip.origin_lng,
            drop_lat: item.trip.destination_lat,
            drop_lng: item.trip.destination_lng,
            destination_lat: reference.destination_lat,
            destination_lng: reference.destination_lng,
            direct_distance_km: Number(reference.distance_km),
          });
          next.detour = detour.detour_km;
          const prediction = await predictMatch({
            time_difference_min: item.facts.timeDifference,
            route_overlap_pct: item.facts.overlap,
            detour_km: detour.detour_km,
            distance_km: Number(reference.distance_km),
            same_transport_mode: item.facts.sameTransport ? 1 : 0,
            destination_distance_km: item.facts.destinationSeparation,
            seats_available: openSeats(item.trip),
            max_detour_km: Number(profile?.max_detour_km || 5),
            max_time_difference_min: MAX_TIME_DIFFERENCE_MIN,
          });
          next.score = prediction;
        } catch (err) {
          next.serviceError = err.message;
        }
        checked.push(next);
        if (!active) return;
      }
      const unchecked = explained.slice(8).map((item) => ({
        ...item,
        detour: null,
        score: null,
        serviceError: "Not sent to routing. YAANA checks the eight closest route overlaps first so the public routing service is not flooded.",
      }));
      if (active) {
        setResults([...checked, ...unchecked]);
        setComparing(false);
      }
    }
    compare();
    return () => { active = false; };
  }, [selected, mine, others, profile?.max_detour_km]);

  async function requestSeat(trip) {
    setStatus("");
    setError("");
    if (!verified) {
      setError("Confirm your DSU email before requesting a seat.");
      return;
    }
    if (isDemoRecord(trip)) {
      const result = demoRequestSeat({ userId: user.id, displayName: profile?.full_name, trip });
      if (result.error) setError(result.error);
      else setStatus(result.reserved ? "Seat reserved on this Chicago test trip." : "Request sent. It is not a reserved seat until the owner accepts it.");
      return;
    }
    const { error: insertError } = await supabase.from("ride_requests").insert({
      trip_id: trip.id,
      requester_id: user.id,
      status: "pending",
    });
    if (insertError) setError(friendlyError(insertError));
    else setStatus("Request sent. It is not a reserved seat until the owner accepts it.");
  }

  const recommended = sortResults(results.filter((item) => item.score?.constraints?.eligible && item.score.prediction === 1), sort);
  const ruledOut = sortResults(results.filter((item) => item.score && !(item.score.constraints.eligible && item.score.prediction === 1)), sort);
  const unverified = sortResults(results.filter((item) => !item.score), sort);
  const referenceTrip = mine.find((trip) => trip.id === selected);

  return (
    <>
      <PageBanner
        tone="teal"
        eyebrow="Matches"
        title="Compare compatible routes."
        lede="Overlap uses saved road geometry. Detour is extra driving distance from OSRM. The model is trained on real Chicago rideshare trips and never overrides seats or detour limits."
      />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {status && <p className="alert alert-success" role="status">{status}</p>}
      {(mine.some((trip) => trip.is_chicago) || others.some((trip) => trip.is_chicago)) && <p className="alert alert-info">{CHICAGO_NOTICE}</p>}
      {loading ? <Skeleton /> : mine.length === 0 ? (
        <EmptyState eyebrow="No reference trip" title="Create a trip before comparing." body="Matching needs one of your future open trips." to="/create-trip" action="Create a trip" />
      ) : (
        <>
          <section className="match-studio">
            <div className="match-controls">
              <p className="eyebrow">Reference route</p>
              <label className="field">
                <span>Your trip</span>
                <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                  {mine.map((trip) => (
                    <option key={trip.id} value={trip.id}>{trip.origin_name} → {trip.destination_name} · {fmtDate(trip.departure_at)}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sort real results</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="overlap">Highest road overlap</option>
                  <option value="time">Closest departure</option>
                  <option value="detour">Smallest estimated detour</option>
                </select>
              </label>
              <p>Your pickup and destination come from this saved trip. To search different places, create another trip.</p>
              <Link className="btn btn-ink" to="/create-trip">Plan another route</Link>
            </div>
            <div>
              {referenceTrip?.route_geometry?.length ? (
                <MapPicker
                  key={referenceTrip.id}
                  origin={[referenceTrip.origin_lat, referenceTrip.origin_lng]}
                  destination={[referenceTrip.destination_lat, referenceTrip.destination_lng]}
                  originLabel={referenceTrip.origin_name}
                  destinationLabel={referenceTrip.destination_name}
                  route={referenceTrip.route_geometry}
                  distanceKm={referenceTrip.distance_km}
                  durationMin={referenceTrip.duration_min}
                  transportMode={referenceTrip.transport_mode}
                  selected
                />
              ) : (
                <p className="alert alert-info">This older trip has no saved road geometry, so route overlap cannot be verified.</p>
              )}
            </div>
          </section>
          {comparing && <p role="status">Checking road detours and model scores…</p>}
          <MatchGroup title="Recommended" items={recommended} empty="No trip currently passes the seat, detour, and time rules and is also classified as a match." onRequest={requestSeat} />
          <MatchGroup title="Not recommended" items={ruledOut} empty="No scored trips were ruled out." onRequest={requestSeat} />
          <MatchGroup title="Could not verify" items={unverified} empty="Every loaded trip was scored." onRequest={requestSeat} />
          {others.length === 0 && <p className="muted">No other open trips are in the database.</p>}
          <p className="form-switch"><Link to="/find-rides">Browse without scores</Link></p>
        </>
      )}
    </>
  );
}

function sortResults(items, sort) {
  const value = (item) => {
    if (sort === "time") return item.facts.timeDifference ?? Number.POSITIVE_INFINITY;
    if (sort === "detour") return item.detour ?? Number.POSITIVE_INFINITY;
    return -(item.facts.overlap ?? -1);
  };
  return [...items].sort((a, b) => value(a) - value(b));
}

function MatchGroup({ title, items, empty, onRequest }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="muted">{empty}</p> : items.map((item) => (
        <article className="trip-card" key={item.trip.id}>
          <strong>{item.trip.origin_name} → {item.trip.destination_name}</strong>
          <ul className="explain">
            <li>Road overlap: {item.facts.overlap == null ? "unavailable" : `${item.facts.overlap}% of sampled points on each saved road route are within 400 m.`}</li>
            <li>Departure gap: {item.facts.timeDifference == null ? "unavailable" : `${item.facts.timeDifference} minutes.`}</li>
            <li>Straight-line gap between destinations: {item.facts.destinationSeparation == null ? "unavailable" : `${item.facts.destinationSeparation} km. This is not road distance.`}</li>
            <li>Estimated extra road distance: {item.detour == null ? "not verified" : `${item.detour} km via the other pickup and drop.`}</li>
            <li>Open seats: {item.facts.openSeats}.</li>
            {item.score && <li>Model score: {item.score.match_percentage}%. {item.score.data_note}</li>}
            {item.score && !item.score.constraints.eligible && <li>{item.score.constraints.reasons.join(" ")}</li>}
            {item.serviceError && <li>{item.serviceError}</li>}
          </ul>
          <button className="btn btn-primary" type="button" disabled={item.trip.status !== "open"} onClick={() => onRequest(item.trip)}>
            Request seat
          </button>
        </article>
      ))}
    </section>
  );
}
