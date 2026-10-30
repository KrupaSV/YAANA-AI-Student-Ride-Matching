import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";

const PRIMARY = [
  { to: "/", label: "Home", hash: "" },
  { to: "/#how", label: "How It Works", hash: "#how" },
  { to: "/#explore", label: "Explore", hash: "#explore" },
  { to: "/#faq", label: "FAQs", hash: "#faq" },
];

function isCurrent(pathname, hash, item) {
  if (item.to === "/login") return pathname === "/login" || pathname === "/forgot-password";
  if (item.to === "/register") return pathname === "/register";
  if (pathname !== "/") return false;
  if (!item.hash) return !hash || hash === "#";
  return hash === item.hash;
}

export default function PublicHeader() {
  const { pathname, hash } = useLocation();
  const locationKey = `${pathname}${hash}`;
  const [open, setOpen] = useState(false);
  const [menuLocation, setMenuLocation] = useState(locationKey);
  const menuId = useId();

  if (menuLocation !== locationKey) {
    setMenuLocation(locationKey);
    if (open) setOpen(false);
  }

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 880) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const actions = [
    { to: "/login", label: "Log in", className: "text-link" },
    { to: "/register", label: "Get started", className: "btn btn-navy" },
  ];

  return (
    <header className={`public-header${open ? " is-open" : ""}`}>
      <Link to="/" className="brand-lockup" aria-label="YAANA home">
        <Logo className="logo-mark logo-header" />
      </Link>

      <nav className="public-nav" aria-label="Primary navigation">
        {PRIMARY.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={isCurrent(pathname, hash, item) ? "is-active" : undefined}
            aria-current={isCurrent(pathname, hash, item) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="public-actions">
        {actions.map((item) => (
          <Link
            key={item.to}
            className={`${item.className}${isCurrent(pathname, hash, item) ? " is-active" : ""}`}
            to={item.to}
            aria-current={isCurrent(pathname, hash, item) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <button
          className="nav-toggle"
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
          <span>Menu</span>
        </button>
      </div>

      <nav
        id={menuId}
        className="public-menu"
        aria-label="Mobile navigation"
        aria-hidden={!open}
      >
        {PRIMARY.map((item) => (
          <Link
            key={`menu-${item.to}`}
            to={item.to}
            className={isCurrent(pathname, hash, item) ? "is-active" : undefined}
            aria-current={isCurrent(pathname, hash, item) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <Link
          className={`text-link${isCurrent(pathname, hash, { to: "/login" }) ? " is-active" : ""}`}
          to="/login"
          aria-current={isCurrent(pathname, hash, { to: "/login" }) ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          Log in
        </Link>
        <Link className="btn btn-navy" to="/register" onClick={() => setOpen(false)}>
          Get started
        </Link>
      </nav>
    </header>
  );
}
