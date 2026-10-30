
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CarFront, Clock3, MapPin, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function DriverDashboard() {
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData?.user;
    setUser(currentUser);

    if (!currentUser) {
      setMessage("Please log in with your driver account.");
      setLoading(false);
      return;
    }

    const { data: app, error: appError } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (appError) setMessage(appError.message);
    setApplication(app);

    if (app?.status === "approved") {
      const { data, error } = await supabase
        .from("auto_bookings")
        .select("*")
        .eq("driver_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) setMessage(error.message);
      setBookings(data || []);
    } else {
      setBookings([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(bookingId, status) {
    setMessage("");

    const { error } = await supabase
      .from("auto_bookings")
      .update({ status })
      .eq("id", bookingId)
      .eq("driver_id", user.id)
      .eq("status", "requested");

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Booking ${status}.`);
      await load();
    }
  }

  if (loading) {
    return <main className="page-container">Loading driver dashboard…</main>;
  }

  if (!application) {
    return (
      <main className="page-container">
        <section className="empty-state">
          <CarFront size={38} />
          <h1>Become a YAANA driver</h1>
          <p>Submit an application before using the driver dashboard.</p>
          <Link className="button button-primary" to="/driver-apply">
            Apply now
          </Link>
        </section>
      </main>
    );
  }

  if (application.status !== "approved") {
    return (
      <main className="page-container">
        <section className="auth-card">
          <Clock3 size={34} />
          <h1>Application {application.status}</h1>
          <p>
            {application.status === "pending"
              ? "Your application is being reviewed. Booking access will unlock after approval."
              : "Your application was rejected. Please contact the YAANA administrator for clarification."}
          </p>
          {application.admin_notes && (
            <p>Admin note: {application.admin_notes}</p>
          )}
          <button className="button button-secondary" onClick={load}>
            <RefreshCw size={16} /> Refresh status
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-container">
      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">DRIVER PARTNER</span>
          <h1>Welcome, {application.full_name}!</h1>
          <p>Your approved driver dashboard is ready.</p>
        </div>
        <span className="status-pill status-approved">Approved</span>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total requests</span>
          <strong>{bookings.length}</strong>
        </article>
        <article className="stat-card">
          <span>Awaiting response</span>
          <strong>{bookings.filter((b) => b.status === "requested").length}</strong>
        </article>
        <article className="stat-card">
          <span>Accepted</span>
          <strong>{bookings.filter((b) => b.status === "accepted").length}</strong>
        </article>
      </section>

      <div className="section-heading">
        <div>
          <h2>Booking requests</h2>
          <p>Review each request before accepting it.</p>
        </div>
        <button className="button button-secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {message && <p role="status" className="form-message">{message}</p>}

      {bookings.length === 0 ? (
        <section className="empty-state">
          <CarFront size={34} />
          <h3>No booking requests yet</h3>
          <p>New requests will appear here when students book your auto.</p>
        </section>
      ) : (
        <section className="trip-list">
          {bookings.map((booking) => (
            <article className="trip-card" key={booking.id}>
              <div className="trip-card-main">
                <span className="eyebrow">
                  {booking.status.toUpperCase()}
                </span>
                <h3>
                  {booking.pickup_location} → {booking.drop_location}
                </h3>
                <p><MapPin size={15} /> {booking.passenger_count} passenger(s)</p>
                <p>
                  Pickup: {new Date(booking.pickup_at).toLocaleString()}
                </p>
                <p>
                  Estimated fare: ₹{Number(booking.estimated_fare).toFixed(2)}
                </p>
              </div>

              {booking.status === "requested" && (
                <div className="trip-card-actions">
                  <button
                    className="button button-primary"
                    onClick={() => respond(booking.id, "accepted")}
                  >
                    Accept
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => respond(booking.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
