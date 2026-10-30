import { fmtDate } from "../lib/supabase";
import { openSeats } from "../lib/matching";
import StatusLabel from "./StatusLabel";

export default function BookingCard({ trip, children }) {
  const seats = openSeats(trip);
  return (
    <article className="trip-card">
      <div className="trip-top">
        <StatusLabel tone="mode">{trip.transport_mode}</StatusLabel>
        <StatusLabel tone={trip.status}>{trip.status}</StatusLabel>
      </div>
      <div className="route-copy">
        <strong>{trip.origin_name}</strong>
        <span aria-hidden="true" />
        <strong>{trip.destination_name}</strong>
      </div>
      <p className="muted">{fmtDate(trip.departure_at)} · {seats} open of {trip.seats_available}</p>
      {trip.owner_display_name && <p className="muted">Posted by {trip.owner_display_name}</p>}
      {trip.is_bangalore && <p className="muted">Bengaluru cab booking from 2013. The date is moved forward so you can test it.</p>}
      {trip.is_demo && !trip.is_bangalore && <p className="muted">Demo listing for testing. Not a live student trip.</p>}
      {Number.isFinite(Number(trip.distance_km)) && (
        <p className="muted">
          {trip.is_bangalore
            ? `Straight-line length ${Number(trip.distance_km).toFixed(1)} km between the recorded pickup and drop.`
            : `Road distance ${Number(trip.distance_km).toFixed(1)} km from the saved driving route.`}
        </p>
      )}
      {children}
    </article>
  );
}
