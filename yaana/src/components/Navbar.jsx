import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Bell, CircleHelp, Compass, LayoutDashboard, LogOut, PanelLeft, Plus, Route, Settings, Sparkles, UserRound,
} from "lucide-react";
import Logo from "./Logo";
import { initials } from "../lib/supabase";

const links = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/trips", "Trips", Route],
  ["/matches", "Matches", Sparkles],
  ["/find-rides", "Find a Ride", Compass],
  ["/notifications", "Notifications", Bell],
  ["/profile", "Profile", UserRound],
  ["/settings", "Settings", Settings],
  ["/help", "Help", CircleHelp],
];

export default function Navbar({ profile, unread = 0, collapsed, onNavigate, onSignOut, onToggleCollapse }) {
  const [menu, setMenu] = useState(false);
  const name = profile?.full_name || "Student";

  useEffect(() => {
    if (!menu) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setMenu(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <div className="side-inner">
      <NavLink className="sidebar-brand brand-lockup" to="/" aria-label="YAANA home" onClick={onNavigate}>
        <Logo className="logo-mark logo-nav" />
      </NavLink>
      <p className="sidebar-word eyebrow">YAANA</p>
      <NavLink className="btn btn-primary" to="/create-trip" onClick={onNavigate}>
        <Plus size={18} aria-hidden="true" />
        <span className="side-label">Create a trip</span>
      </NavLink>
      <nav className="side-nav" aria-label="Account">
        {links.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} className="side-link" onClick={onNavigate}>
            <Icon size={18} aria-hidden="true" />
            <span className="side-label">{label}</span>
            {to === "/notifications" && unread > 0 && <b className="count">{unread}</b>}
          </NavLink>
        ))}
      </nav>
      <button className="btn btn-ghost collapse-button" type="button" onClick={onToggleCollapse}>
        <PanelLeft size={16} aria-hidden="true" />
        <span className="side-label">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
      </button>
      <div className="side-user avatar-menu">
        {menu && (
          <div className="avatar-pop" role="menu">
            <NavLink role="menuitem" to="/profile" onClick={() => { setMenu(false); onNavigate(); }}>Profile</NavLink>
            <button role="menuitem" type="button" onClick={onSignOut}><LogOut size={16} aria-hidden="true" /> Log out</button>
          </div>
        )}
        <button className="side-user-button" type="button" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((value) => !value)}>
          {profile?.avatar_url ? (
            <img className="mini-avatar" src={profile.avatar_url} alt="" />
          ) : (
            <span className="mini-avatar" aria-hidden="true">{initials(name)}</span>
          )}
          <span>
            <strong>{name}</strong>
            <small>{profile?.verification_status === "verified" ? "Email confirmed" : "Confirmation pending"}</small>
          </span>
        </button>
      </div>
    </div>
  );
}
