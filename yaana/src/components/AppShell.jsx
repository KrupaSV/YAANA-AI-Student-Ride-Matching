import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import Logo from "./Logo";
import Navbar from "./Navbar";

export default function AppShell() {
  const { profile, schemaGap, confirmed, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("yaana-sidebar") === "collapsed");
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!profile?.id || !supabase) return undefined;
    let active = true;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .is("read_at", null)
      .then(({ count }) => {
        if (active) setUnread(count || 0);
      });
    return () => { active = false; };
  }, [profile?.id, location.pathname]);

  function toggleCollapse() {
    setCollapsed((value) => {
      localStorage.setItem("yaana-sidebar", value ? "open" : "collapsed");
      return !value;
    });
  }

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#content">Skip to content</a>
      {open && <button className="backdrop" type="button" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Navbar
          profile={profile}
          unread={unread}
          collapsed={collapsed}
          onNavigate={() => setOpen(false)}
          onSignOut={logout}
          onToggleCollapse={toggleCollapse}
        />
      </aside>
      <div className="main-stage">
        <header className="topbar">
          <button className="menu-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? <X size={20} /> : <Menu size={20} />}
            <span>Menu</span>
          </button>
          <span className="brand-lockup topbar-brand">
            <Logo className="logo-mark logo-top" />
          </span>
        </header>
        <div id="content" className="page">
          {schemaGap === "init" && (
            <p className="alert alert-info" role="status">
              This Supabase project is still on the original tables. In the SQL editor, run
              yaana/supabase/migrations/20261026183000_init.sql, then
              yaana/supabase/migrations/20261026213000_theme_and_account.sql.
              The first file adds trip routes, requester names, notifications, and access rules.
              The second adds theme, a departure note, and account deletion. Neither file deletes student rows. Refresh after both succeed.
            </p>
          )}
          {schemaGap === "theme" && (
            <p className="alert alert-info" role="status">
              Trip columns are present. Run yaana/supabase/migrations/20261026213000_theme_and_account.sql
              so theme, departure notes, and account deletion can be saved. Then refresh.
            </p>
          )}
          {confirmed && profile?.verification_status && profile.verification_status !== "verified" && (
            <p className="alert alert-info" role="status">
              Your inbox is confirmed, but this profile is not marked verified. A matching college domain alone is not verification.
            </p>
          )}
          <motion.div
            key={location.pathname}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <Outlet context={{ refreshUnread: setUnread }} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
