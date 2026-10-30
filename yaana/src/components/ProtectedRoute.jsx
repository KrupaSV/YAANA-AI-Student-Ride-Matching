import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function ProtectedRoute() {
  const { loading, session, confirmed, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="boot" role="status">Checking your session…</main>;
  }
  if (!configured || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (!confirmed) {
    return <Navigate to="/login?notice=confirm" replace />;
  }
  return <Outlet />;
}
