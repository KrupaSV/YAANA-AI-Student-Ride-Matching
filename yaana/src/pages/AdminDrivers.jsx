
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function AdminDrivers() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [admin, setAdmin] = useState(false);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      setAdmin(false);
      setMessage("Please log in using the authorised admin account.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      setAdmin(false);
      setMessage("Access denied. This page is for authorised admins only.");
      setLoading(false);
      return;
    }

    setAdmin(true);

    const { data, error } = await supabase
      .from("driver_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setApplications(data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(application, status) {
    setMessage("");

    const { error } = await supabase
      .from("driver_applications")
      .update({
        status,
        admin_notes: notes[application.id] || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", application.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Application ${status}.`);
      await load();
    }
  }

  if (loading) {
    return <main className="page-container">Loading admin review…</main>;
  }

  if (!admin) {
    return (
      <main className="page-container">
        <section className="empty-state">
          <ShieldCheck size={38} />
          <h1>Admin access only</h1>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-container">
      <section className="dashboard-welcome">
        <div>
          <span className="eyebrow">YAANA CONTROL CENTRE</span>
          <h1>Driver verification</h1>
          <p>Review driver applications before granting booking access.</p>
        </div>
        <ShieldCheck size={36} />
      </section>

      <div className="section-heading">
        <h2>Applications ({applications.length})</h2>
        <button className="button button-secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {message && <p role="status" className="form-message">{message}</p>}

      {applications.length === 0 ? (
        <section className="empty-state">
          <h3>No applications yet</h3>
          <p>New driver applications will appear here.</p>
        </section>
      ) : (
        <section className="trip-list">
          {applications.map((app) => (
            <article className="trip-card" key={app.id}>
              <div className="trip-card-main">
                <span className={`status-pill status-${app.status}`}>
                  {app.status}
                </span>
                <h3>{app.full_name}</h3>
                <p>Phone: {app.phone}</p>
                <p>Vehicle: {app.vehicle_model} · {app.vehicle_number}</p>
                <p>Licence number: {app.licence_number}</p>
                <p>Submitted: {new Date(app.created_at).toLocaleString()}</p>
                {app.reviewed_at && (
                  <p>Reviewed: {new Date(app.reviewed_at).toLocaleString()}</p>
                )}
              </div>

              <label className="field">
                <span>Admin notes</span>
                <textarea
                  rows="2"
                  value={notes[app.id] ?? app.admin_notes ?? ""}
                  onChange={(event) =>
                    setNotes((old) => ({
                      ...old,
                      [app.id]: event.target.value,
                    }))
                  }
                  placeholder="Reason or verification notes"
                />
              </label>

              {app.status === "pending" && (
                <div className="trip-card-actions">
                  <button
                    className="button button-primary"
                    onClick={() => review(app, "approved")}
                  >
                    Approve driver
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => review(app, "rejected")}
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
