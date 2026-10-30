import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/useTitle";
import { applyTheme, readTheme } from "../lib/theme";
import PageBanner from "../components/PageBanner";
import { useToast } from "../components/Toast";

const items = [
  ["notify_trip_updates", "Trip requests", "Store a notification when someone requests your trip."],
  ["notify_match_updates", "Request decisions", "Store a notification when your request is accepted, declined, or a trip is cancelled."],
  ["compact_cards", "Compact cards", "Use a tighter trip layout on this account."],
  ["reduced_motion", "Reduce motion", "Turn off decorative animation on this browser."],
];

export default function Settings() {
  useTitle("Settings");
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const [confirmDelete, setConfirmDelete] = useState("");
  const toast = useToast();

  useEffect(() => {
    document.documentElement.dataset.motion = profile?.reduced_motion ? "reduced" : "normal";
  }, [profile?.reduced_motion]);

  async function toggle(key) {
    setError("");
    setMessage("");
    const { error: updateError } = await supabase.from("profiles").update({ [key]: !profile?.[key] }).eq("id", user.id);
    if (updateError) setError(friendlyError(updateError));
    else {
      await refreshProfile(user.id);
      setMessage("Saved to your profile.");
      toast("Saved to your profile.", "success");
    }
  }

  function chooseTheme(choice) {
    const saved = applyTheme(choice);
    setTheme(saved);
    setMessage("");
    setError("");
    if (!profile || !supabase) return;
    supabase.from("profiles").update({ theme: saved }).eq("id", user.id).then(async ({ error: updateError }) => {
      if (updateError) setError(friendlyError(updateError));
      else {
        await refreshProfile(user.id);
        setMessage("Theme saved on this account.");
      }
    });
  }

  async function deleteAccount() {
    setError("");
    setMessage("");
    if (confirmDelete !== "DELETE") {
      setError("Type DELETE to confirm account removal.");
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("delete_own_account");
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    await signOut();
    navigate("/login", { replace: true });
  }

  async function resetLink() {
    setBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (resetError) setError(friendlyError(resetError));
    else setMessage("Password reset email sent. Open it in this browser.");
  }

  return (
    <>
      <PageBanner tone="lime" eyebrow="Settings" title="Account settings." lede={`Signed in as ${user?.email}.`} />
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      <div className="settings-grid">
      <section className="settings-panel settings-appearance stack">
        <h2>Appearance</h2>
        <div className="tabs" role="radiogroup" aria-label="Theme">
          {["light", "dark", "system"].map((choice) => (
            <button key={choice} className="btn btn-secondary" type="button" role="radio" aria-checked={theme === choice} onClick={() => chooseTheme(choice)}>
              {choice}
            </button>
          ))}
        </div>
        <p className="muted">The choice is stored in this browser immediately. It is also saved on your profile after the latest migration.</p>
      </section>
      <section className="settings-panel settings-notifications stack">
        <h2>Notifications and motion</h2>
        {items.map(([key, label, detail]) => (
          <div className="setting-row" key={key}>
            <div><strong>{label}</strong><p>{detail}</p></div>
            <button className={`switch ${profile?.[key] ? "is-on" : ""}`} type="button" role="switch" aria-label={label} aria-checked={Boolean(profile?.[key])} onClick={() => toggle(key)}>
              <span />
            </button>
          </div>
        ))}
      </section>
      <section className="settings-panel settings-session stack">
        <h2>Password and session</h2>
        <Link className="btn btn-secondary" to="/profile">Edit student profile</Link>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={resetLink}>Email me a reset link</button>
        <button className="btn btn-primary" type="button" onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}>Log out of this browser</button>
      </section>
      <section className="settings-panel settings-danger stack">
        <h2>Delete this account</h2>
        <p>This removes the signed-in Supabase user. Related profile and trip rows follow the database delete rules. YAANA reports deletion only after that call succeeds.</p>
        <label className="field">
          <span>Type DELETE to confirm</span>
          <input value={confirmDelete} onChange={(event) => setConfirmDelete(event.target.value)} />
        </label>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={deleteAccount}>Delete account</button>
      </section>
      </div>
    </>
  );
}
