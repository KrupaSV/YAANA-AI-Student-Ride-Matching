
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CarFront, ShieldCheck, Clock3 } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function DriverApply() {
  const [user, setUser] = useState(null);
  const [application, setApplication] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    vehicle_number: "",
    vehicle_model: "",
    licence_number: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const currentUser = data?.user;
      setUser(currentUser);

      if (currentUser) {
        const { data: existing } = await supabase
          .from("driver_applications")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (existing) {
          setApplication(existing);
          setForm({
            full_name: existing.full_name || "",
            phone: existing.phone || "",
            vehicle_number: existing.vehicle_number || "",
            vehicle_model: existing.vehicle_model || "",
            licence_number: existing.licence_number || "",
          });
        } else {
          setForm((old) => ({
            ...old,
            full_name:
              currentUser.user_metadata?.full_name || "",
          }));
        }
      }
      setLoading(false);
    }

    load();
  }, []);

  function change(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    if (!user) {
      setMessage("Please log in to apply as a driver.");
      return;
    }

    if (application) {
      setMessage(
        "Your application is already submitted. Contact an admin if you need to correct your details."
      );
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("driver_applications")
      .insert({
        user_id: user.id,
        ...form,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setApplication(data);
      setMessage("Application submitted! It is now awaiting admin review.");
    }
    setSaving(false);
  }

  if (loading) return <main className="page-container">Loading application…</main>;

  return (
    <main className="page-container">
      <section className="auth-layout">
        <div className="auth-story">
          <span className="eyebrow">YAANA DRIVER PARTNER</span>
          <h1>Drive with YAANA.</h1>
          <p>
            Apply to join the campus auto network. Our admin team
            reviews applications before drivers can receive bookings.
          </p>
          <div className="feature-row">
            <ShieldCheck size={22} />
            <span>Driver approval before bookings</span>
          </div>
          <div className="feature-row">
            <Clock3 size={22} />
            <span>Check your application status online</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="section-icon"><CarFront size={25} /></div>
          <h2>Driver application</h2>

          {application ? (
            <div className="notice">
              <h3>
                Application: {application.status.toUpperCase()}
              </h3>
              <p>
                {application.status === "pending" &&
                  "Your details are waiting for admin review."}
                {application.status === "approved" &&
                  "You are approved. Open your driver dashboard to view requests."}
                {application.status === "rejected" &&
                  "Your application was not approved. Contact the admin for next steps."}
              </p>
              {application.admin_notes && (
                <p>Admin note: {application.admin_notes}</p>
              )}
              <Link className="button button-primary" to="/driver-dashboard">
                Driver dashboard
              </Link>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              {[
                ["full_name", "Full name"],
                ["phone", "Phone number"],
                ["vehicle_number", "Vehicle registration number"],
                ["vehicle_model", "Vehicle model"],
                ["licence_number", "Driving licence number"],
              ].map(([name, label]) => (
                <label className="field" key={name}>
                  <span>{label}</span>
                  <input
                    name={name}
                    value={form[name]}
                    onChange={change}
                    required
                    autoComplete="off"
                  />
                </label>
              ))}

              <p className="muted">
                Enter accurate details. Do not upload sensitive documents
                until a secure document-upload process is configured.
              </p>

              {message && <p role="status" className="form-message">{message}</p>}

              <button className="button button-primary" disabled={saving}>
                {saving ? "Submitting…" : "Submit for verification"}
              </button>
            </form>
          )}

          {message && application && <p role="status">{message}</p>}
        </div>
      </section>
    </main>
  );
}
