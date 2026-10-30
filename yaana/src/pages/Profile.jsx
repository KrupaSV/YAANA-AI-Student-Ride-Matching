import { useEffect, useState } from "react";
import { supabase, friendlyError, fmtDate, initials } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { isTestingRegistration, validateName } from "../lib/validation";
import { TRANSPORT_MODES } from "../lib/matching";
import { useTitle } from "../lib/useTitle";
import PageBanner from "../components/PageBanner";

const labels = {
  verified: isTestingRegistration() ? "Email confirmed" : "Email confirmed for an allowed domain",
  pending: "Waiting for the confirmation link",
  unverified: isTestingRegistration() ? "This email is not verified yet" : "This domain is not on the allowed list",
};

export default function Profile() {
  useTitle("Profile");
  const { user, profile, refreshProfile, schemaReady } = useAuth();
  const [form, setForm] = useState({ name: "", department: "", transport: "Auto", detour: 5, departure: "" });
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.full_name || "",
      department: profile.department || "",
      transport: profile.transport_preference || "Auto",
      detour: profile.max_detour_km || 5,
      departure: profile.preferred_departure || "",
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    supabase.from("trips").select("id, origin_name, destination_name, departure_at, status").eq("user_id", user.id).order("departure_at", { ascending: false }).limit(8)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(friendlyError(queryError));
        else setHistory(data || []);
      });
    return () => { active = false; };
  }, [user]);

  async function save(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const nameError = validateName(form.name);
    if (nameError) {
      setError(nameError);
      return;
    }
    const detour = Number(form.detour);
    if (!Number.isFinite(detour) || detour < 0.5 || detour > 30) {
      setError("Choose a maximum detour between 0.5 and 30 km.");
      return;
    }
    setSaving(true);
    const payload = {
      full_name: form.name.trim(),
      department: form.department.trim() || null,
      transport_preference: form.transport,
      max_detour_km: detour,
    };
    if (schemaReady) payload.preferred_departure = form.departure.trim() || null;
    const { error: updateError } = await supabase.from("profiles").update(payload).eq("id", user.id);
    setSaving(false);
    if (updateError) setError(friendlyError(updateError));
    else {
      await refreshProfile(user.id);
      setMessage("Profile saved.");
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setError("Choose a JPEG, PNG, or WebP under 2 MB.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from("avatars").upload(path, file);
    if (uploaded.error) {
      setError(friendlyError(uploaded.error));
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    if (updateError) setError(friendlyError(updateError));
    else {
      await refreshProfile(user.id);
      setMessage("Photo saved.");
    }
  }

  return (
    <>
      <PageBanner tone="pink" eyebrow="Profile" title="Student profile." lede="USN and email stay read-only. Verification is set by the confirmation process, not by this form." />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      <div className="profile-editor">
        <aside className="card profile-card">
          {profile?.avatar_url ? (
            <img className="avatar" src={profile.avatar_url} alt="" />
          ) : (
            <div className="avatar" aria-hidden="true">{initials(profile?.full_name || user?.email)}</div>
          )}
          <h2>{profile?.full_name || "Your name"}</h2>
          <p>{labels[profile?.verification_status] || "Verification status unavailable"}</p>
          <label className="btn btn-secondary">
            Upload photo
            <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} />
          </label>
        </aside>
        <form className="profile-form form-grid" onSubmit={save}>
          <label className="field"><span>Full name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label className="field"><span>USN</span><input value={profile?.usn || ""} readOnly /></label>
          <label className="field"><span>College email</span><input value={user?.email || ""} readOnly /></label>
          <label className="field"><span>Department</span><input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label className="field">
            <span>Preferred transport</span>
            <select value={form.transport} onChange={(event) => setForm({ ...form, transport: event.target.value })}>
              {TRANSPORT_MODES.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Maximum detour you will accept (km)</span>
            <input type="number" min="0.5" max="30" step="0.5" value={form.detour} onChange={(event) => setForm({ ...form, detour: event.target.value })} />
          </label>
          {schemaReady && (
            <label className="field">
              <span>Preferred departure note</span>
              <input value={form.departure} placeholder="Weekday mornings" onChange={(event) => setForm({ ...form, departure: event.target.value })} />
            </label>
          )}
          <p className="muted">Account created {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "date unavailable"}.</p>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
        </form>
      </div>
      <section className="history-strip">
        <h2>Ride history</h2>
        {history.length === 0 ? <p className="muted">No trips are stored for this account yet.</p> : history.map((trip) => (
          <article className="trip-card" key={trip.id}>
            <strong>{trip.origin_name} → {trip.destination_name}</strong>
            <p className="muted">{fmtDate(trip.departure_at)} · {trip.status}</p>
          </article>
        ))}
      </section>
    </>
  );
}
