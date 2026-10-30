import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { configuredDomains } from "./validation";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

const coreColumns = [
  "id", "full_name", "usn", "student_email", "transport_preference", "avatar_url", "role",
  "department", "verification_status", "max_detour_km", "reduced_motion", "compact_cards",
  "notify_trip_updates", "notify_match_updates",
].join(", ");

const baseProfileColumns = "id, full_name, usn, student_email, transport_preference, avatar_url, role";

async function readProfile(userId) {
  if (!supabase || !userId) return { profile: null, schemaReady: false, schemaGap: "init" };

  const core = await supabase.from("profiles").select(coreColumns).eq("id", userId).maybeSingle();
  if (core.error) {
    const base = await supabase.from("profiles").select(baseProfileColumns).eq("id", userId).maybeSingle();
    if (base.error) throw base.error;
    return { profile: base.data, schemaReady: false, schemaGap: "init" };
  }

  const extra = await supabase.from("profiles").select("theme, preferred_departure").eq("id", userId).maybeSingle();
  if (extra.error) return { profile: core.data, schemaReady: false, schemaGap: "theme" };
  const matches = await supabase.from("trip_matches").select("id").limit(1);
  if (matches.error && /trip_matches|schema cache|does not exist|could not find the table/i.test(matches.error.message || "")) {
    return { profile: { ...core.data, ...extra.data }, schemaReady: false, schemaGap: "matches" };
  }
  const settings = await supabase.from("app_settings").select("key").eq("key", "registration_mode").maybeSingle();
  if (settings.error && /app_settings|schema cache|does not exist|could not find the table/i.test(settings.error.message || "")) {
    return { profile: { ...core.data, ...extra.data }, schemaReady: false, schemaGap: "registration" };
  }
  return { profile: { ...core.data, ...extra.data }, schemaReady: true, schemaGap: "" };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [schemaGap, setSchemaGap] = useState("");
  const [domains, setDomains] = useState(configuredDomains);

  const refreshProfile = useCallback(async (userId) => {
    const id = userId || user?.id;
    if (!id) {
      setProfile(null);
      return null;
    }
    const result = await readProfile(id);
    setProfile(result.profile);
    setSchemaReady(result.schemaReady);
    setSchemaGap(result.schemaGap);
    return result.profile;
  }, [user?.id]);

  useEffect(() => {
    let active = true;

    async function restore() {
      if (!supabase) {
        if (active) setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);

      if (!data.session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const verified = await supabase.auth.getUser();
      if (!active) return;
      if (verified.error || !verified.data.user) {
        await supabase.auth.signOut({ scope: "local" });
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(verified.data.user);
      try {
        const result = await readProfile(verified.data.user.id);
        if (active) {
          setProfile(result.profile);
          setSchemaReady(result.schemaReady);
          setSchemaGap(result.schemaGap);
        }
      } catch {
        if (active) setProfile(null);
      }
      if (active) setLoading(false);
    }

    restore();

    if (!supabase) return () => { active = false; };

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    readProfile(user.id)
      .then((result) => {
        if (!active) return;
        setProfile(result.profile);
        setSchemaReady(result.schemaReady);
        setSchemaGap(result.schemaGap);
      })
      .catch(() => {
        if (active) setProfile(null);
      });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    async function loadDomains() {
      const fallback = configuredDomains();
      if (!supabase) {
        if (active) setDomains(fallback);
        return;
      }
      const { data, error } = await supabase.from("allowed_email_domains").select("domain");
      if (!active) return;
      if (error || !data?.length) {
        setDomains(fallback);
        return;
      }
      setDomains(data.map((row) => String(row.domain).trim().toLowerCase()).filter(Boolean));
    }
    loadDomains();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = profile?.reduced_motion ? "reduced" : "normal";
    document.documentElement.dataset.cards = profile?.compact_cards ? "compact" : "comfortable";
  }, [profile?.reduced_motion, profile?.compact_cards]);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    loading,
    schemaReady,
    schemaGap,
    domains,
    configured: Boolean(supabase),
    confirmed: Boolean(user?.email_confirmed_at),
    verified: profile?.verification_status === "verified" && Boolean(user?.email_confirmed_at),
    refreshProfile,
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setUser(null);
      setProfile(null);
    },
  }), [session, user, profile, loading, schemaReady, schemaGap, domains, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
