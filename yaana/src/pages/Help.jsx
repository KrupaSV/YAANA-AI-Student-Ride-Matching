import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/useTitle";

export default function Help() {
  useTitle("Help");
  const { isTestingRegistration: testing } = useAuth();
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Help</p>
        <h1>How YAANA works in practice.</h1>
      </header>
      <section className="stack">
        <article className="card">
          <h2>Verification</h2>
          <p>{testing
            ? "Temporary testing mode is on. Any valid email may register, including Gmail and Outlook, and a USN is not required. Opening the confirmation email is still required before trips and matches. Restore DSU-only registration by setting VITE_REGISTRATION_MODE=production and setting public.app_settings.registration_mode to production."
            : "An address must use an exact allowed domain, currently @dsu.edu.in unless the project owner adds another domain in the database and the frontend environment. Opening the confirmation email marks the profile verified. YAANA does not check a university roster."}</p>
        </article>
        <article className="card">
          <h2>Maps</h2>
          <p>Pickup and destination search covers Bengaluru and the commute area around DSU’s Harohalli campus. Search by locality, station, bus stop or landmark. You can also drop a pin if a place is missing. Place data and streets are from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. OSRM calculates the driving route.</p>
        </article>
        <article className="card">
          <h2>Matching</h2>
          <p>After a trip is published, YAANA compares it with other students' open trips in Supabase. A match needs the same travel date, a departure gap of about 30 minutes, nearby pickups or overlapping saved routes, nearby destinations, the same transport mode, and open seats. Both students see the match, get a notification, and accept or decline on their own. The ride is confirmed only after both accept.</p>
        </article>
        <article className="card">
          <h2>Safety</h2>
          <p>Meet in a public place, confirm the stop before leaving, and do not share passwords or payment codes. Cancel from My Rides if the plan changes.</p>
        </article>
      </section>
    </>
  );
}
