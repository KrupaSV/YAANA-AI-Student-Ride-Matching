import { useEffect, useState } from "react";
import { supabase, fmtDate, friendlyError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { demoMarkRead, demoNotifications, isDemoRecord } from "../lib/demo";
import { useTitle } from "../lib/useTitle";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";

export default function Notifications() {
  useTitle("Notifications");
  const { user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: queryError } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const demo = demoNotifications(user.id, profile?.full_name);
    if (queryError) setError(friendlyError(queryError));
    setRows([...(data || []), ...demo]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user.id, profile?.full_name]);

  async function markRead(id) {
    const row = rows.find((item) => item.id === id);
    if (isDemoRecord(row)) {
      demoMarkRead(id, user.id);
      setRows((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
      return;
    }
    const { error: updateError } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    if (updateError) setError(friendlyError(updateError));
    else setRows((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Notifications</p>
        <h1>Activity from your trips.</h1>
      </header>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {loading ? <Skeleton /> : rows.length === 0 ? (
        <EmptyState eyebrow="Quiet" title="No notifications yet." body="A request, acceptance, decline, or cancellation will appear here. Nothing is shown before that happens." />
      ) : rows.map((row) => (
        <article className="trip-card" key={row.id}>
          <strong>{row.title}</strong>
          <p>{row.body}</p>
          <p className="muted">{fmtDate(row.created_at)} {row.read_at ? "· Read" : ""}</p>
          {!row.read_at && <button className="btn btn-secondary" type="button" onClick={() => markRead(row.id)}>Mark read</button>}
        </article>
      ))}
    </>
  );
}
