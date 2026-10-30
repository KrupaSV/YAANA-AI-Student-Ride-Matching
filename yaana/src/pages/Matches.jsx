import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase, fmtDate, friendlyError, initials } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { openSeats } from "../lib/matching";
import { evaluatePair } from "../lib/autoMatch";
import {
  loadOpenStudentTrips,
  myResponse,
  ownTripFromMatch,
  peerFromMatch,
  syncMatchesForUser,
  theirResponse,
} from "../lib/syncMatches";
import PageBanner from "../components/PageBanner";
import { useTitle } from "../lib/useTitle";
import { useToast } from "../components/Toast";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import StatusLabel from "../components/StatusLabel";
import MapPicker from "../components/MapPicker";

const STATUS_COPY = {
  pending: "Waiting",
  confirmed: "Confirmed",
  rejected: "Declined",
};

export default function Matches() {
  useTitle("Matches");
  const { user, verified } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [rows, setRows] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(location.state?.published ? "Trip saved. Looking for compatible classmates…" : "");
  const [busy, setBusy] = useState("");
  const [selectedId, setSelectedId] = useState("");

  async function load() {
    setLoading(true);
    const synced = await syncMatchesForUser(user.id);
    if (synced.missingTable) setMissingTable(true);
    if (synced.error && !synced.missingTable) setError(synced.error);
    else setError("");
    if (synced.created > 0) {
      setStatus(`${synced.created} new ${synced.created === 1 ? "match" : "matches"} found.`);
    }
    setMine(synced.mine || []);

    const { data, error: queryError } = await supabase
      .from("trip_matches")
      .select("*, trip_a:trips!trip_a_id(*), trip_b:trips!trip_b_id(*)")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (queryError) {
      const fallback = await supabase
        .from("trip_matches")
        .select("*")
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (fallback.error) {
        if (synced.missingTable) {
          const computed = await computedFallback(user.id);
          setRows(computed);
        } else {
          setError(friendlyError(queryError));
          setRows([]);
        }
      } else {
        setRows(await attachTrips(fallback.data || []));
      }
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    load().then(() => {
      if (!active) return;
    });
    const channel = supabase
      ?.channel(`trip-matches-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_matches" }, () => {
        load();
      })
      .subscribe();
    return () => {
      active = false;
      channel?.unsubscribe();
    };
  }, [user.id]);

  async function respond(match, response) {
    if (!verified) {
      setError("Confirm your DSU email before responding to a match.");
      return;
    }
    setBusy(match.id);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("respond_to_trip_match", {
      p_match_id: match.id,
      p_response: response,
    });
    setBusy("");
    if (rpcError) {
      setError(friendlyError(rpcError));
      toast(friendlyError(rpcError), "error");
      return;
    }
    const message = response === "accepted"
      ? (data?.status === "confirmed" ? "You both accepted. This shared ride is confirmed." : "You accepted. Waiting for the other student.")
      : "You declined this match.";
    setStatus(message);
    toast(message, "success");
    await load();
  }

  const visible = useMemo(
    () => [...rows].sort((a, b) => {
      const rank = { pending: 0, confirmed: 1, rejected: 2 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || Number(b.score || 0) - Number(a.score || 0);
    }),
    [rows],
  );
  const selected = visible.find((row) => row.id === selectedId) || visible.find((row) => row.status !== "rejected") || visible[0];
  const selectedPeer = selected ? peerFromMatch(selected, user.id) : null;
  const selectedMine = selected ? ownTripFromMatch(selected, user.id) : mine[0];

  return (
    <>
      <PageBanner
        tone="teal"
        eyebrow="Matches"
        title="Your ride matches."
        lede="When a classmate publishes a similar route on the same date, within about 30 minutes, YAANA creates a match for both of you. Accept or decline independently. The ride is confirmed only after both students accept."
      />
      {missingTable && (
        <p className="alert alert-info" role="status">
          Two-way matches need one more database update. In the Supabase SQL editor, run
          yaana/supabase/migrations/20261030173000_trip_matches.sql, then refresh. Student trips already saved are not deleted.
        </p>
      )}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {status && <p className="alert alert-success" role="status">{status}</p>}
      {loading ? <Skeleton /> : visible.length === 0 ? (
        <EmptyState
          eyebrow="Looking"
          title={mine.length === 0 ? "Create a trip before matching." : "No compatible classmates yet."}
          body={mine.length === 0
            ? "Matching starts after you publish a trip with a pickup, destination, and departure time."
            : "YAANA will keep looking when another student publishes a similar route on the same date, around the same time. Chicago board listings are not used as student matches."}
          to="/create-trip"
          action="Create a trip"
        />
      ) : (
        <div className="split">
          <div className="stack">
            {visible.map((match) => {
              const peer = peerFromMatch(match, user.id);
              const mineTrip = ownTripFromMatch(match, user.id);
              const mineReply = myResponse(match, user.id);
              const theirs = theirResponse(match, user.id);
              return (
                <article className={`trip-card ${selected?.id === match.id ? "is-selected" : ""}`} key={match.id}>
                  <div className="match-head">
                    <PeerAvatar name={peer.name} src={peer.avatarUrl} />
                    <div>
                      <strong>{peer.name || "Classmate"}</strong>
                      <p className="eyebrow">{STATUS_COPY[match.status] || match.status} · {match.score}% compatible</p>
                    </div>
                    <StatusLabel tone={match.status}>{STATUS_COPY[match.status] || match.status}</StatusLabel>
                  </div>
                  <p className="muted">Your trip: {mineTrip?.origin_name} → {mineTrip?.destination_name} · {fmtDate(mineTrip?.departure_at)}</p>
                  <p className="muted">Their trip: {peer.trip?.origin_name} → {peer.trip?.destination_name} · {fmtDate(peer.trip?.departure_at)}</p>
                  <p className="muted">{peer.trip?.transport_mode} · {openSeats(peer.trip)} open of {peer.trip?.seats_available} · {match.time_difference_min} min apart</p>
                  <div className="row">
                    <button className="btn btn-secondary" type="button" onClick={() => setSelectedId(match.id)}>Details</button>
                    {match.status !== "rejected" && mineReply !== "accepted" && (
                      <button className="btn btn-primary" type="button" disabled={busy === match.id} onClick={() => respond(match, "accepted")}>
                        {busy === match.id ? "Saving…" : "Accept"}
                      </button>
                    )}
                    {match.status !== "rejected" && mineReply !== "rejected" && (
                      <button className="btn btn-ghost" type="button" disabled={busy === match.id} onClick={() => respond(match, "rejected")}>
                        Decline
                      </button>
                    )}
                  </div>
                  {mineReply === "accepted" && match.status === "pending" && <p className="muted">You accepted. Waiting for {peer.name || "the other student"}.</p>}
                  {theirs === "accepted" && mineReply === "pending" && <p className="muted">{peer.name || "The other student"} already accepted. Confirm or decline below.</p>}
                </article>
              );
            })}
          </div>
          <MatchPreview match={selected} mine={selectedMine} peer={selectedPeer} userId={user.id} />
        </div>
      )}
      <p className="form-switch"><Link to="/find-rides">Browse all open trips</Link></p>
    </>
  );
}

function PeerAvatar({ name, src }) {
  if (src) return <img className="avatar" src={src} alt="" />;
  return <span className="avatar" aria-hidden="true">{initials(name)}</span>;
}

function MatchPreview({ match, mine, peer, userId }) {
  if (!match || !peer?.trip) {
    return <p className="alert alert-info">Choose a match to see both routes.</p>;
  }
  const facts = mine && peer.trip ? evaluatePair(mine, peer.trip) : null;
  const route = peer.trip.route_geometry || mine?.route_geometry || [];
  return (
    <div className="stack">
      <article className="trip-card">
        <p className="eyebrow">Shared ride</p>
        <div className="match-head">
          <PeerAvatar name={peer.name} src={peer.avatarUrl} />
          <div>
            <strong>{peer.name || "Classmate"}</strong>
            <p className="muted">Compatibility {match.score} / 100</p>
          </div>
        </div>
        <ul className="explain">
          <li>Pickup: {peer.trip.origin_name}</li>
          <li>Destination: {peer.trip.destination_name}</li>
          <li>Departure: {fmtDate(peer.trip.departure_at)}</li>
          <li>Transport: {peer.trip.transport_mode}</li>
          <li>Open seats: {openSeats(peer.trip)} of {peer.trip.seats_available}</li>
          <li>Pickup gap: {match.pickup_km == null ? "not stored" : `${match.pickup_km} km`}</li>
          <li>Destination gap: {match.destination_km == null ? "not stored" : `${match.destination_km} km`}</li>
          <li>Road overlap: {match.overlap_pct == null ? (facts?.overlapPct == null ? "unavailable" : `${facts.overlapPct}%`) : `${match.overlap_pct}%`}</li>
          <li>Your reply: {myResponse(match, userId)}. Their reply: {theirResponse(match, userId)}.</li>
        </ul>
      </article>
      {route.length > 1 ? (
        <MapPicker
          key={match.id}
          origin={[peer.trip.origin_lat, peer.trip.origin_lng]}
          destination={[peer.trip.destination_lat, peer.trip.destination_lng]}
          originLabel={peer.trip.origin_name}
          destinationLabel={peer.trip.destination_name}
          route={route}
          distanceKm={peer.trip.distance_km}
          durationMin={peer.trip.duration_min}
          transportMode={peer.trip.transport_mode}
        />
      ) : (
        <p className="alert alert-info">No saved road geometry for this match yet.</p>
      )}
    </div>
  );
}

async function attachTrips(matches) {
  const ids = [...new Set(matches.flatMap((row) => [row.trip_a_id, row.trip_b_id]))];
  if (!ids.length) return matches;
  const { data } = await supabase.from("trips").select("*").in("id", ids);
  const byId = Object.fromEntries((data || []).map((trip) => [trip.id, trip]));
  return matches.map((row) => ({ ...row, trip_a: byId[row.trip_a_id], trip_b: byId[row.trip_b_id] }));
}

async function computedFallback(userId) {
  const loaded = await loadOpenStudentTrips(userId);
  if (loaded.error) return [];
  const rows = [];
  for (const trip of loaded.mine) {
    for (const other of loaded.others) {
      const evaluation = evaluatePair(trip, other);
      if (!evaluation.compatible) continue;
      rows.push({
        id: `${trip.id}:${other.id}`,
        user_a_id: trip.user_id,
        user_b_id: other.user_id,
        a_display_name: trip.owner_display_name,
        b_display_name: other.owner_display_name,
        score: evaluation.score,
        pickup_km: evaluation.pickupKm,
        destination_km: evaluation.destinationKm,
        overlap_pct: evaluation.overlapPct,
        time_difference_min: evaluation.timeDifferenceMin,
        status: "pending",
        response_a: "pending",
        response_b: "pending",
        trip_a: trip,
        trip_b: other,
        ephemeral: true,
      });
    }
  }
  return rows;
}
