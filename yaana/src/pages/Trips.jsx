import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { TRANSPORT_MODES } from "../lib/matching";
import {
  BANGALORE_NOTICE,
  demoRequests,
  demoRevealEmail,
  demoRequestSeat,
  demoRunAction,
  isDemoRecord,
  mergeDemoTrips,
} from "../lib/demo";
import { useTitle } from "../lib/useTitle";
import { useToast } from "../components/Toast";
import BookingCard from "../components/BookingCard";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import MapPicker from "../components/MapPicker";

const tabs = [
  ["mine", "My trips"],
  ["available", "Available trips"],
  ["requests", "My requests"],
];

export default function Trips() {
  useTitle("Trips");
  const { user, profile, verified } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [tab, setTab] = useState("mine");
  const [trips, setTrips] = useState([]);
  const [available, setAvailable] = useState([]);
  const [sent, setSent] = useState([]);
  const [received, setReceived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(location.state?.saved ? "Trip saved." : "");
  const [busy, setBusy] = useState("");
  const [emails, setEmails] = useState({});
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [day, setDay] = useState("");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    const now = new Date().toISOString();
    const [mine, outgoing, incoming, openTrips] = await Promise.all([
      supabase.from("trips").select("*").eq("user_id", user.id).order("departure_at", { ascending: false }),
      supabase.from("ride_requests").select("*, trips(*)").eq("requester_id", user.id).order("created_at", { ascending: false }),
      supabase.from("ride_requests").select("*, trips!inner(*)").eq("trips.user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("trips").select("*").in("status", ["open", "full"]).gt("departure_at", now).order("departure_at", { ascending: true }).limit(100),
    ]);
    const problem = mine.error || outgoing.error || incoming.error || openTrips.error;
    const allTrips = mergeDemoTrips(
      [...(mine.data || []), ...(openTrips.data || [])],
      user.id,
      profile?.full_name,
    );
    const demo = demoRequests(user.id, profile?.full_name);
    if (problem) setError(friendlyError(problem));
    else setError("");
    setTrips(allTrips.filter((trip) => trip.user_id === user.id));
    setAvailable(allTrips.filter((trip) => trip.user_id !== user.id && ["open", "full"].includes(trip.status) && new Date(trip.departure_at) > new Date()));
    setSent([...(outgoing.data || []), ...demo.sent]);
    setReceived([...(incoming.data || []), ...demo.received]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user.id, profile?.full_name]);

  function matches(trip) {
    const text = `${trip.origin_name} ${trip.destination_name}`.toLowerCase();
    const sameDay = !day || String(trip.departure_at).slice(0, 10) === day;
    return text.includes(search.toLowerCase())
      && sameDay
      && (mode === "all" || trip.transport_mode === mode)
      && (statusFilter === "all" || trip.status === statusFilter);
  }

  async function run(id, fn) {
    setBusy(id);
    setError("");
    setStatus("");
    const demoTarget = [...trips, ...available, ...sent, ...received].find((row) => row.id === id);
    if (isDemoRecord(demoTarget) || sent.some((row) => row.id === id && isDemoRecord(row)) || received.some((row) => row.id === id && isDemoRecord(row))) {
      const result = demoRunAction(fn, id, user.id, profile?.full_name);
      setBusy("");
      if (result.error) {
        setError(result.error);
        toast(result.error, "error");
      } else {
        setStatus(result.message);
        toast(result.message, "success");
        await load();
      }
      return;
    }
    const args = fn === "cancel_trip" ? { p_trip_id: id } : { p_request_id: id };
    const { error: rpcError } = await supabase.rpc(fn, args);
    setBusy("");
    if (rpcError) {
      setError(friendlyError(rpcError));
      toast(friendlyError(rpcError), "error");
    } else {
      const message = fn === "accept_ride_request" ? "Request accepted. The seat is reserved." : "Updated.";
      setStatus(message);
      toast(message, "success");
      await load();
    }
  }

  async function reveal(id) {
    const demoRow = [...sent, ...received].find((row) => row.id === id);
    if (isDemoRecord(demoRow)) {
      const result = demoRevealEmail(id);
      if (result.error) setError(result.error);
      else setEmails((current) => ({ ...current, [id]: result.email }));
      return;
    }
    const { data, error: rpcError } = await supabase.rpc("reveal_participant_email", { p_request_id: id });
    if (rpcError) setError(friendlyError(rpcError));
    else setEmails((current) => ({ ...current, [id]: data }));
  }

  async function requestSeat(trip) {
    setError("");
    setStatus("");
    if (!verified) {
      setError("Confirm your DSU email before requesting a seat.");
      return;
    }
    setBusy(trip.id);
    if (isDemoRecord(trip)) {
      const result = demoRequestSeat({ userId: user.id, displayName: profile?.full_name, trip, note });
      setBusy("");
      if (result.error) {
        setError(result.error);
        toast(result.error, "error");
      } else {
        const message = result.reserved
          ? "Seat reserved on this 2013 test booking."
          : "Request sent. This is not a reserved seat until the owner accepts it.";
        setStatus(message);
        toast(message, "success");
        await load();
      }
      return;
    }
    const { error: insertError } = await supabase.from("ride_requests").insert({
      trip_id: trip.id,
      requester_id: user.id,
      status: "pending",
      message: note.trim() || null,
    });
    setBusy("");
    if (insertError) {
      setError(friendlyError(insertError));
      toast(friendlyError(insertError), "error");
    } else {
      const message = "Request sent. This is not a reserved seat until the owner accepts it.";
      setStatus(message);
      toast(message, "success");
    }
  }

  async function saveDraft(event) {
    event.preventDefault();
    setBusy(draft.id);
    setError("");
    const { error: updateError } = await supabase.from("trips").update({
      departure_at: new Date(draft.departure_at).toISOString(),
      seats_available: Number(draft.seats_available),
      transport_mode: draft.transport_mode,
      preferences: draft.preferences || null,
    }).eq("id", draft.id);
    setBusy("");
    if (updateError) {
      setError(friendlyError(updateError));
      toast(friendlyError(updateError), "error");
    } else {
      setStatus("Trip details saved.");
      toast("Trip details saved.", "success");
      setDraft(null);
      await load();
    }
  }

  const visibleMine = trips.filter(matches);
  const visibleAvailable = available.filter(matches);

  return (
    <>
      <PageBanner
        tone="tangerine"
        eyebrow="Trips"
        title="Trips and seat requests."
        lede="Review published trips, browse available seats, and respond to incoming requests."
        action={<Link className="btn btn-primary" to="/create-trip">Create a trip</Link>}
      />
      <div className="tabs" role="tablist" aria-label="Trip lists">
        {tabs.map(([id, label]) => (
          <button key={id} className="btn btn-secondary" type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pickup or destination" aria-label="Search trips" />
        <input type="date" value={day} aria-label="Departure date" onChange={(event) => setDay(event.target.value)} />
        <select value={mode} aria-label="Transport" onChange={(event) => setMode(event.target.value)}>
          <option value="all">All transport</option>
          {TRANSPORT_MODES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={statusFilter} aria-label="Trip status" onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="full">Full</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {(trips.some((trip) => trip.is_bangalore) || available.some((trip) => trip.is_bangalore)) && <p className="alert alert-info">{BANGALORE_NOTICE}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {status && <p className="alert alert-success" role="status">{status}</p>}
      {loading ? <Skeleton /> : tab === "mine" ? (
        visibleMine.length === 0 ? <EmptyState eyebrow="Empty" title="No trips match these filters." body="Create a trip when you know the route and departure time." to="/create-trip" action="Create a trip" /> : visibleMine.map((trip) => (
          <BookingCard key={trip.id} trip={trip}>
            <div className="row">
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(trip)}>Details</button>
              {trip.status === "open" && (
                <button className="btn btn-secondary" type="button" onClick={() => setDraft({ ...trip, departure_at: trip.departure_at.slice(0, 16) })}>Edit details</button>
              )}
              {trip.status !== "cancelled" && (
                <button className="btn btn-ghost" type="button" disabled={busy === trip.id} onClick={() => run(trip.id, "cancel_trip")}>Cancel listing</button>
              )}
            </div>
          </BookingCard>
        ))
      ) : tab === "available" ? (
        visibleAvailable.length === 0 ? <EmptyState eyebrow="No trips" title="No open trips match this search." body="There are no other future trips in the database for these filters." to="/create-trip" action="Create a trip" /> : (
          <div className="split">
            <div>
              {visibleAvailable.map((trip) => (
                <BookingCard key={trip.id} trip={trip}>
                  <div className="row">
                    <button className="btn btn-secondary" type="button" onClick={() => setSelected(trip)}>Details</button>
                    <button className="btn btn-primary" type="button" disabled={busy === trip.id || trip.status !== "open" || sent.some((row) => row.trip_id === trip.id && ["pending", "accepted"].includes(row.status))} onClick={() => requestSeat(trip)}>
                      {busy === trip.id ? "Sending…" : sent.some((row) => row.trip_id === trip.id && row.status === "accepted") ? "Seat reserved" : sent.some((row) => row.trip_id === trip.id && row.status === "pending") ? "Requested" : "Request seat"}
                    </button>
                  </div>
                </BookingCard>
              ))}
              <label className="field">
                <span>Optional note with a request</span>
                <textarea value={note} maxLength="280" onChange={(event) => setNote(event.target.value)} />
              </label>
            </div>
            <RoutePreview trip={selected} />
          </div>
        )
      ) : (
        <>
          <section>
            <h2>Requests you sent</h2>
            {sent.length === 0 ? <p className="muted">You have not requested a seat.</p> : sent.filter((request) => !search || `${request.trips?.origin_name} ${request.trips?.destination_name}`.toLowerCase().includes(search.toLowerCase())).map((request) => (
              <article className="trip-card" key={request.id}>
                <strong>{request.trips?.origin_name} → {request.trips?.destination_name}</strong>
                <p className="muted">Status: {request.status}. {request.status === "accepted" ? (request.trips?.is_bangalore ? "Seat reserved on this 2013 test booking." : "The owner accepted this seat.") : "Not reserved yet."}</p>
                {["pending", "accepted"].includes(request.status) && (
                  <button className="btn btn-secondary" type="button" disabled={busy === request.id} onClick={() => run(request.id, "cancel_ride_request")}>Cancel request</button>
                )}
                {request.status === "accepted" && <button className="btn btn-ghost" type="button" onClick={() => reveal(request.id)}>Show confirmed email</button>}
                {emails[request.id] && <p>{emails[request.id]}</p>}
              </article>
            ))}
          </section>
          <section>
            <h2>Requests on your trips</h2>
            {received.length === 0 ? <p className="muted">No one has requested your trips.</p> : received.map((request) => (
              <article className="trip-card" key={request.id}>
                <strong>{request.requester_name || "Student"}</strong>
                <p className="muted">{request.status} · {request.trips?.origin_name} → {request.trips?.destination_name}</p>
                {request.message && <p>{request.message}</p>}
                {request.status === "pending" && (
                  <div className="row">
                    <button className="btn btn-primary" type="button" disabled={busy === request.id} onClick={() => run(request.id, "accept_ride_request")}>Accept</button>
                    <button className="btn btn-secondary" type="button" disabled={busy === request.id} onClick={() => run(request.id, "reject_ride_request")}>Decline</button>
                  </div>
                )}
                {request.status === "accepted" && <button className="btn btn-ghost" type="button" onClick={() => reveal(request.id)}>Show confirmed email</button>}
                {emails[request.id] && <p>{emails[request.id]}</p>}
              </article>
            ))}
          </section>
        </>
      )}
      {selected && tab === "mine" && <RoutePreview trip={selected} />}
      {draft && (
        <form className="card form-grid" onSubmit={saveDraft}>
          <h2>Update {draft.origin_name} → {draft.destination_name}</h2>
          <p className="muted">The saved road route stays as published. Change the time, seats, mode, or note.</p>
          <label className="field"><span>Departure</span><input type="datetime-local" value={draft.departure_at} onChange={(event) => setDraft({ ...draft, departure_at: event.target.value })} required /></label>
          <label className="field"><span>Seats</span><input type="number" min="1" max="6" value={draft.seats_available} onChange={(event) => setDraft({ ...draft, seats_available: event.target.value })} required /></label>
          <label className="field">
            <span>Transport</span>
            <select value={draft.transport_mode} onChange={(event) => setDraft({ ...draft, transport_mode: event.target.value })}>
              {TRANSPORT_MODES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field"><span>Note</span><textarea value={draft.preferences || ""} onChange={(event) => setDraft({ ...draft, preferences: event.target.value })} /></label>
          <div className="row">
            <button className="btn btn-primary" disabled={busy === draft.id}>{busy === draft.id ? "Saving…" : "Save changes"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
    </>
  );
}

function RoutePreview({ trip }) {
  if (!trip) return null;
  if (!trip.route_geometry?.length) {
    return <p className="alert alert-info">This trip has no saved road geometry, so the map cannot draw a route.</p>;
  }
  return (
    <MapPicker
      key={trip.id}
      origin={[trip.origin_lat, trip.origin_lng]}
      destination={[trip.destination_lat, trip.destination_lng]}
      originLabel={trip.origin_name}
      destinationLabel={trip.destination_name}
      route={trip.route_geometry}
      distanceKm={trip.distance_km}
      durationMin={trip.duration_min}
      transportMode={trip.transport_mode}
    />
  );
}
