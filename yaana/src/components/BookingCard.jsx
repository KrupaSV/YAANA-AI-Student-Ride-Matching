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
      {trip.distance_km != null && Number.isFinite(Number(trip.distance_km)) && (
        <p className="muted">Road distance {Number(trip.distance_km).toFixed(1)} km from the saved driving route.</p>
      )}
      {children}
    </article>
  );
}
