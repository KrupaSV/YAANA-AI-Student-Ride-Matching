import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, fmtDate, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { mergeDemoTrips } from "../lib/demo";
import { useTitle } from "../lib/useTitle";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import RouteArt from "../components/RouteArt";
import PageBanner from "../components/PageBanner";

export default function Dashboard() {
  useTitle("Dashboard");
  const { user, profile } = useAuth();
  const [trips, setTrips] = useState([]);
  const [requests, setRequests] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    async function load() {
      setLoading(true);
      const [mine, incoming, openTrips, matches] = await Promise.all([
        supabase.from("trips").select("*").eq("user_id", user.id).order("departure_at", { ascending: true }),
        supabase.from("ride_requests").select("id, status, created_at, trip_id").eq("requester_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase
          .from("trips")
          .select("id, origin_name, destination_name, departure_at, transport_mode, status")
          .eq("status", "open")
          .neq("user_id", user.id)
          .gt("departure_at", new Date().toISOString())
          .order("departure_at", { ascending: true })
          .limit(3),
        supabase
          .from("trip_matches")
          .select("id, status, score, a_display_name, b_display_name, user_a_id, user_b_id, created_at")
          .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      if (!active) return;
      const allTrips = mergeDemoTrips(
        [...(mine.error ? [] : mine.data || []), ...(openTrips.error ? [] : openTrips.data || [])],
        user.id,
        profile?.full_name,
      );
      if (mine.error) setError(friendlyError(mine.error));
      setTrips(allTrips.filter((trip) => trip.user_id === user.id));
      if (incoming.error) setError(friendlyError(incoming.error));
      else setRequests(incoming.data || []);
      setCandidates(allTrips.filter((trip) => trip.user_id !== user.id && !trip.is_chicago && trip.status === "open").slice(0, 6));
      setPendingMatches(matches.error ? [] : matches.data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [user, profile?.full_name]);

  const name = (profile?.full_name || user?.user_metadata?.full_name || "").trim().split(/\s+/)[0];
  const upcoming = trips.filter((trip) => new Date(trip.departure_at) >= new Date() && trip.status !== "cancelled");
  const openTrips = trips.filter((trip) => trip.status === "open");
  const mapTrip = upcoming.find((trip) => trip.route_geometry?.length > 1)
    || trips.find((trip) => trip.route_geometry?.length > 1)
    || candidates.find((trip) => trip.route_geometry?.length > 1);

  return (
    <>
      <PageBanner
        tone="coral"
        eyebrow="Dashboard"
        title={name ? `Welcome back, ${name}.` : "Welcome back."}
        lede="Your published trips, seat requests, and saved travel preferences."
        action={<Link className="btn btn-primary" to="/create-trip">Create a trip</Link>}
      />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {loading ? <Skeleton rows={4} /> : (
        <div className="dash-board">
          <div className="stack">
            <section className="dash-counts" aria-label="Your counts">
              <article><b>{trips.length}</b><span>Trips created</span></article>
              <article><b>{upcoming.length}</b><span>Upcoming</span></article>
              <article><b>{openTrips.length}</b><span>Open listings</span></article>
              <article><b>{pendingMatches.length}</b><span>Pending matches</span></article>
            </section>
            <section className="dash-ticket">
              <h2>Upcoming rides</h2>
              {upcoming.length === 0 ? (
                <EmptyState eyebrow="Nothing scheduled" title="No upcoming trips yet." body="Create a trip when you know your route and departure time." to="/create-trip" action="Create a trip" />
              ) : upcoming.slice(0, 4).map((trip) => (
                <article key={trip.id}>
                  <strong>{trip.origin_name} → {trip.destination_name}</strong>
                  <p>{fmtDate(trip.departure_at)} · {trip.status}</p>
                </article>
              ))}
              <Link to="/trips">Open trips</Link>
            </section>
            <section className="dash-note">
              <h2>Recent activity</h2>
              {requests.length === 0 ? (
                <EmptyState eyebrow="No requests" title="No seat requests yet." body="A request shows up here only after you send one. The list stays empty until then." to="/matches" action="Compare matches" />
              ) : requests.map((request) => (
                <article key={request.id}>
                  <strong>{request.status}</strong>
                  <p>{fmtDate(request.created_at)}</p>
                </article>
              ))}
            </section>
          </div>
          <aside className="stack">
            <section className="dash-road">
              <div className="section-row"><div><p className="eyebrow">Route overview</p><h2>Matching follows the road</h2></div></div>
              <RouteArt trip={mapTrip} />
              <p className="muted">
                {mapTrip
                  ? `${mapTrip.origin_name} to ${mapTrip.destination_name}. Matching uses the geometry saved with each published trip.`
                  : "Matching uses the geometry saved with each published student trip."}
              </p>
            </section>
            <section className="dash-note">
              <h2>Saved preferences</h2>
              <p>Transport: {profile?.transport_preference || "Not set"}</p>
              <p>Maximum detour: {profile?.max_detour_km == null ? "Not stored yet" : `${profile.max_detour_km} km`}</p>
              <p>Department: {profile?.department || "Not set"}</p>
              <Link className="btn btn-ink" to="/profile">Edit profile</Link>
            </section>
            <section className="dash-ticket">
              <p className="eyebrow">Ride matches</p>
              <h2>Waiting for a reply</h2>
              {pendingMatches.length === 0 ? (
                <p>No pending classmate matches yet. YAANA looks again whenever you or another student publishes a similar trip.</p>
              ) : pendingMatches.map((match) => (
                <article key={match.id}>
                  <strong>{match.user_a_id === user.id ? match.b_display_name : match.a_display_name}</strong>
                  <p>{match.score}% compatible · {match.status}</p>
                </article>
              ))}
              <Link className="btn btn-ink" to="/matches">Open Matches</Link>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
