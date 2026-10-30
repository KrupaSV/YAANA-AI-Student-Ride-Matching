import { useEffect, useState } from "react";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { TRANSPORT_MODES } from "../lib/matching";
import { BANGALORE_NOTICE, demoRequestSeat, demoRequests, isDemoRecord, mergeDemoTrips } from "../lib/demo";
import { useTitle } from "../lib/useTitle";
import { useToast } from "../components/Toast";
import BookingCard from "../components/BookingCard";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import MapPicker from "../components/MapPicker";

export default function FindRides() {
  useTitle("Find a ride");
  const { user, profile, verified } = useAuth();
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [asked, setAsked] = useState({});
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("trips")
      .select("*")
      .in("status", ["open", "full"])
      .gt("departure_at", new Date().toISOString())
      .order("departure_at", { ascending: true })
      .limit(100);
    if (queryError) setError(friendlyError(queryError));
    const { data: mine } = await supabase
      .from("ride_requests")
      .select("trip_id, status")
      .eq("requester_id", user.id)
      .in("status", ["pending", "accepted"]);
    const next = {};
    for (const row of mine || []) next[row.trip_id] = row.status;
    for (const row of demoRequests(user.id, profile?.full_name).sent) {
      if (["pending", "accepted"].includes(row.status)) next[row.trip_id] = row.status;
    }
    setAsked(next);
    setTrips(mergeDemoTrips(data || [], user.id, profile?.full_name).filter((trip) => trip.user_id !== user.id));
    setLoading(false);
  }

  useEffect(() => { load(); }, [user.id, profile?.full_name]);

  const filtered = trips.filter((trip) => {
    const text = `${trip.origin_name} ${trip.destination_name}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (mode === "all" || trip.transport_mode === mode);
  });

  async function requestSeat(trip) {
    setStatus("");
    setError("");
    if (!verified) {
      setError("Confirm your DSU email before requesting a seat.");
      toast("Confirm your DSU email before requesting a seat.", "error");
      return;
    }
    if (trip.status !== "open") {
      setError("This trip has no open seats.");
      return;
    }
    setBusy(trip.id);
    if (isDemoRecord(trip)) {
      const result = demoRequestSeat({
        userId: user.id,
        displayName: profile?.full_name,
        trip,
        note,
      });
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
        setAsked((current) => ({ ...current, [trip.id]: result.reserved ? "accepted" : "pending" }));
        if (result.reserved) {
          setTrips((current) => current.map((row) => (
            row.id === trip.id ? { ...row, seats_taken: result.seats_taken, status: result.status } : row
          )));
        }
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
      setStatus("Request sent. This is not a reserved seat until the owner accepts it.");
      toast("Request sent. This is not a reserved seat until the owner accepts it.", "success");
      setAsked((current) => ({ ...current, [trip.id]: "pending" }));
    }
  }

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Find a ride</p>
        <h1>Open trips from other students.</h1>
        <p>Names are visible. Email stays hidden until a request is accepted.</p>
      </header>
      <div className="toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pickup or destination" aria-label="Search trips" />
        <select value={mode} aria-label="Transport" onChange={(event) => setMode(event.target.value)}>
          <option value="all">All transport</option>
          {TRANSPORT_MODES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button className="btn btn-secondary" type="button" onClick={load}>Refresh</button>
      </div>
      {trips.some((trip) => trip.is_bangalore) && <p className="alert alert-info">{BANGALORE_NOTICE}</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {status && <p className="alert alert-success" role="status">{status}</p>}
      {loading ? <Skeleton /> : filtered.length === 0 ? (
        <EmptyState eyebrow="No trips" title="Nothing matches right now." body="There are no open future trips in the database for this search." to="/create-trip" action="Create a trip" />
      ) : (
        <div className="split">
          <div className="stack">
            {filtered.map((trip) => (
              <BookingCard key={trip.id} trip={trip}>
                <div className="row">
                  <button className="btn btn-secondary" type="button" aria-pressed={selected?.id === trip.id} onClick={() => setSelected(trip)}>
                    {selected?.id === trip.id ? "Route shown" : "Show route"}
                  </button>
                  <button className="btn btn-primary" type="button" disabled={busy === trip.id || trip.status !== "open" || Boolean(asked[trip.id])} onClick={() => requestSeat(trip)}>
                    {busy === trip.id ? "Sending…" : asked[trip.id] === "accepted" ? "Seat reserved" : asked[trip.id] ? "Requested" : "Request seat"}
                  </button>
                </div>
              </BookingCard>
            ))}
          </div>
          <div>
            <label className="field">
              <span>Optional note with a request</span>
              <textarea value={note} maxLength="280" onChange={(event) => setNote(event.target.value)} />
            </label>
            {selected?.route_geometry?.length ? (
              <MapPicker
                key={selected.id}
                origin={[selected.origin_lat, selected.origin_lng]}
                destination={[selected.destination_lat, selected.destination_lng]}
                originLabel={selected.origin_name}
                destinationLabel={selected.destination_name}
                route={selected.route_geometry}
                distanceKm={selected.distance_km}
                durationMin={selected.duration_min}
                transportMode={selected.transport_mode}
                selected
              />
            ) : (
              <p className="alert alert-info">Choose a trip to see its saved road route. Older trips without geometry cannot draw one.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
