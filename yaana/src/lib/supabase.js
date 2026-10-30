import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();

function usableKey(value) {
  const key = value?.trim();
  if (!key || key.length < 30) return "";
  if (key.startsWith("sb_secret_")) return "";
  return key;
}

const supabaseKey =
  usableKey(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  usableKey(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (typeof window !== "undefined" && window.location.pathname === "/auth/callback") {
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
    sessionStorage.setItem("yaana-auth-callback", JSON.stringify(snapshot));
  }
}

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "implicit",
          storage: window.localStorage,
        },
      })
    : null;

export const supabaseConfigured = Boolean(supabase);

export function friendlyError(error) {
  const message = error?.message || "Something went wrong. Please try again.";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "This email is already registered. Log in instead.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirm your email before logging in.";
  }
  if (lower.includes("otp_expired") || lower.includes("expired")) {
    return "This email link has expired. Request a new one.";
  }
  if (lower.includes("approved college email") || lower.includes("limited to approved")) {
    return "This email domain is not accepted while DSU-only registration is on. Switch testing mode back on, or use an approved college address.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (lower.includes("network") || lower.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (lower.includes("duplicate key") || lower.includes("ride_requests_one_active")) {
    return "You already have an open request for this trip.";
  }
  if (lower.includes("no seats left")) return "No seats are left on this trip.";
  if (/schema cache|could not find the|relation .* does not exist|function .* does not exist/i.test(message)) {
    return "The database is missing a YAANA update. Run the SQL migration in the Supabase SQL editor, then refresh.";
  }
  return message;
}

export function fmtDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toDatetimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function initials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "YA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
