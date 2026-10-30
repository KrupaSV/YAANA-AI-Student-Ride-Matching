import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { authRedirectUrl, validateLogin, validateRegistration } from "../lib/validation";
import AuthLayout from "../components/AuthLayout";
import { useTitle } from "../lib/useTitle";

export default function AuthPage({ mode = "login" }) {
  const isRegister = mode === "register";
  useTitle(isRegister ? "Get started" : "Log in");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { domains, configured, loading, session, confirmed } = useAuth();
  const [form, setForm] = useState({ name: "", usn: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(params.get("notice") === "confirm" ? "confirm" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && session && confirmed && !isRegister) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, session, confirmed, isRegister, navigate]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!configured || !supabase) {
      setError("Supabase is not configured. Add the project URL and publishable key to yaana/.env.local.");
      return;
    }

    const result = isRegister ? validateRegistration(form, domains) : validateLogin(form, domains);
    setErrors(result.errors);
    if (!result.valid) return;

    setBusy(true);
    try {
      if (isRegister) {
        const { data, error: signError } = await supabase.auth.signUp({
          email: result.email,
          password: form.password,
          options: {
            emailRedirectTo: authRedirectUrl("/dashboard"),
            data: { full_name: result.name, usn: result.usn },
          },
        });
        if (signError) throw signError;
        if (data.session && data.user?.email_confirmed_at) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setNotice("sent");
      } else {
        const { data, error: signError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: form.password,
        });
        if (signError) throw signError;
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: "local" });
          setNotice("confirm");
          return;
        }
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    if (!supabase) return;
    const result = validateLogin(form, domains);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: result.email,
      options: { emailRedirectTo: authRedirectUrl("/dashboard") },
    });
    setBusy(false);
    if (resendError) setError(friendlyError(resendError));
    else setNotice("sent");
  }

  return (
    <AuthLayout
      tone={isRegister ? "register" : "login"}
      title={isRegister ? <>Get <em>started.</em></> : <>Welcome <em>back.</em></>}
    >
      {notice === "sent" && (
        <div className="alert alert-success" role="status">
          <strong>Confirmation email sent.</strong>
          <p>Waiting for confirmation. Open the link in this same browser, then YAANA will take you to the dashboard.</p>
        </div>
      )}
      {notice === "confirm" && (
        <div className="alert alert-info" role="status">
          <strong>Waiting for confirmation.</strong>
          <p>Your email is not verified yet. Open the latest YAANA message, or resend it below.</p>
        </div>
      )}
      {error && <p className="alert alert-error" role="alert">{error}</p>}

      <form className="form-grid" onSubmit={submit} noValidate>
        {isRegister && (
          <>
            <Field label="Full name" error={errors.name}>
              <input value={form.name} autoComplete="name" onChange={(event) => update("name", event.target.value)} required />
            </Field>
            <Field label="USN" error={errors.usn}>
              <input value={form.usn} autoCapitalize="characters" onChange={(event) => update("usn", event.target.value.toUpperCase())} required />
            </Field>
          </>
        )}
        <Field label="College email" error={errors.email}>
          <input type="email" value={form.email} autoComplete="email" placeholder={`name@${domains[0] || "dsu.edu.in"}`} onChange={(event) => update("email", event.target.value)} required />
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="password-row">
            <input type={showPassword ? "text" : "password"} value={form.password} autoComplete={isRegister ? "new-password" : "current-password"} onChange={(event) => update("password", event.target.value)} required />
            <button type="button" className="btn btn-ghost" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {isRegister && <PasswordMeter password={form.password} />}
        </Field>
        {isRegister && (
          <Field label="Confirm password" error={errors.confirmPassword}>
            <input type={showPassword ? "text" : "password"} value={form.confirmPassword} autoComplete="new-password" onChange={(event) => update("confirmPassword", event.target.value)} required />
          </Field>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Get started" : "Log in"}
        </button>
      </form>

      {!isRegister && (
        <button className="text-button" type="button" onClick={resend} disabled={busy}>Resend confirmation email</button>
      )}
      {!isRegister && <p className="form-switch"><Link to="/forgot-password">Forgot password?</Link></p>}
      <p className="form-switch">
        {isRegister ? "Already confirmed?" : "New student?"}{" "}
        <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Get started"}</Link>
      </p>
    </AuthLayout>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

function PasswordMeter({ password }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const level = score <= 2 ? 1 : score <= 3 ? 2 : 3;
  const label = level === 1 ? "Needs a letter and a number" : level === 2 ? "Usable" : "Strong";
  return (
    <div>
      <div className="password-meter" data-level={level} aria-hidden="true"><i /><i /><i /></div>
      <small className="field-note">Password strength: {label}</small>
    </div>
  );
}
