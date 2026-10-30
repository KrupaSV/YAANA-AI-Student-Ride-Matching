import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { authRedirectUrl, validateLogin } from "../lib/validation";
import AuthLayout from "../components/AuthLayout";
import { useTitle } from "../lib/useTitle";

export default function ForgotPassword() {
  useTitle("Forgot password");
  const { configured, isTestingRegistration: testing } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    const result = validateLogin({ email, password: "placeholder" });
    if (result.errors.email) {
      setError(result.errors.email);
      return;
    }
    if (!configured || !supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(result.email, {
      redirectTo: authRedirectUrl("/reset-password"),
    });
    setBusy(false);
    if (resetError) setError(friendlyError(resetError));
    else setSent(true);
  }

  return (
    <AuthLayout
      title="Reset your password."
      lede={testing
        ? "If this email has an account, YAANA will send a link. The message does not reveal whether the address is registered."
        : "If this college email has an account, YAANA will send a link. The message does not reveal whether the address is registered."}
    >
      {sent && (
        <div className="alert alert-success" role="status">
          <strong>Check your inbox.</strong>
          <p>If an account exists, a reset link is on the way. Open it in this browser.</p>
        </div>
      )}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            value={email}
            placeholder="Enter your email address"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      </form>
      <p className="form-switch"><Link to="/login">Back to login</Link></p>
    </AuthLayout>
  );
}
