import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { validatePassword } from "../lib/validation";
import AuthLayout from "../components/AuthLayout";
import { useTitle } from "../lib/useTitle";

export default function ResetPassword() {
  useTitle("Choose a new password");
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Those passwords do not match.");
      return;
    }
    if (!supabase || !session) {
      setError("Open the reset link from your email before choosing a password.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(friendlyError(updateError));
    else setDone(true);
  }

  return (
    <AuthLayout title="Choose a new password." lede="Use at least 8 characters, with one letter and one number.">
      {loading && <p className="alert alert-info" role="status">Checking the reset session…</p>}
      {!loading && !session && (
        <div className="alert alert-error" role="alert">
          <strong>This reset session is missing.</strong>
          <p>Request a new link and open it in this browser.</p>
          <Link className="btn btn-primary" to="/forgot-password">Request a new link</Link>
        </div>
      )}
      {done && (
        <div className="alert alert-success" role="status">
          <strong>Password updated.</strong>
          <button className="btn btn-primary" type="button" onClick={() => navigate("/dashboard")}>Go to dashboard</button>
        </div>
      )}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {session && !done && (
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>New password</span>
            <input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input type="password" value={confirmPassword} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        </form>
      )}
    </AuthLayout>
  );
}
