import { Link } from "react-router-dom";
import { Route } from "lucide-react";

export default function EmptyState({ eyebrow, title, body, to, action }) {
  return (
    <section className="empty empty-art">
      <span className="empty-icon" aria-hidden="true"><Route size={22} /></span>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        <p>{body}</p>
        {to && action ? <Link className="btn btn-ink" to={to}>{action}</Link> : null}
      </div>
    </section>
  );
}
