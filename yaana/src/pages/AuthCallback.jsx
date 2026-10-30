import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, friendlyError } from "../lib/supabase";
import { safeNextPath } from "../lib/validation";
import AuthLayout from "../components/AuthLayout";
import { useTitle } from "../lib/useTitle";

const SNAPSHOT = "yaana-auth-callback";

function readSnapshot() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const snapshot = {
    error: hash.get("error") || query.get("error") || "",
    errorCode: hash.get("error_code") || query.get("error_code") || "",
    errorDescription: hash.get("error_description") || query.get("error_description") || "",
    type: hash.get("type") || query.get("type") || "",
    next: query.get("next") || "",
    hasCredential: Boolean(hash.get("access_token") || hash.get("refresh_token") || query.get("code")),
  };
  if (snapshot.hasCredential || snapshot.error || snapshot.errorCode || snapshot.type) {
    sessionStorage.setItem(SNAPSHOT, JSON.stringify(snapshot));
    return snapshot;
  }
  const saved = sessionStorage.getItem(SNAPSHOT);
  return saved ? JSON.parse(saved) : snapshot;
}

function classify(snapshot, initError) {
  const text = `${snapshot.errorCode} ${snapshot.errorDescription} ${initError?.message || ""}`.toLowerCase();
  if (text.includes("otp_expired") || text.includes("expired")) return "expired";
  if (snapshot.error || snapshot.errorCode || initError) return "invalid";
  return "";
}

export default function AuthCallback() {
  useTitle("Confirming email");
  const navigate = useNavigate();
  const [state, setState] = useState("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let active = true;

    async function finish() {
      const snapshot = readSnapshot();
      if (!supabase) {
        if (active) {
          setState("invalid");
          setDetail("Supabase is not configured.");
        }
        return;
      }

      const init = await supabase.auth.initialize();
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const problem = classify(snapshot, init.error);

      if (problem) {
        setState(problem);
        setDetail(init.error ? friendlyError(init.error) : snapshot.errorDescription.replace(/\+/g, " "));
        return;
      }

      const session = data.session;
      const next = snapshot.type === "recovery" ? "/reset-password" : safeNextPath(snapshot.next);
      if (session) {
        setState("success");
        window.setTimeout(() => {
          sessionStorage.removeItem(SNAPSHOT);
          if (active) navigate(next, { replace: true });
        }, 900);
        return;
      }

      if (snapshot.hasCredential) {
        setState("login");
        return;
      }
      setState("invalid");
    }

    finish();
    return () => { active = false; };
  }, [navigate]);

  const copy = {
    checking: ["Checking the link", "YAANA is reading the confirmation response."],
    success: ["Email verified", "Taking you to your next page."],
    expired: ["This link has expired", detail || "Request a new confirmation or password email."],
    invalid: ["This link is not valid", detail || "It may already have been used, or it was opened without the original browser session."],
    login: ["Email verified", "Your inbox is confirmed, but this browser is not signed in."],
  }[state];

  return (
    <AuthLayout title={copy[0]} lede={copy[1]}>
      <div className={`alert ${state === "success" ? "alert-success" : state === "checking" ? "alert-info" : "alert-error"}`} role="status">
        <strong>{copy[0]}</strong>
        <p>{copy[1]}</p>
      </div>
      {state !== "checking" && state !== "success" && (
        <div className="stack">
          <Link className="btn btn-primary" to="/login" onClick={() => sessionStorage.removeItem(SNAPSHOT)}>Log in</Link>
          <Link className="btn btn-secondary" to="/forgot-password">Reset password</Link>
        </div>
      )}
    </AuthLayout>
  );
}
