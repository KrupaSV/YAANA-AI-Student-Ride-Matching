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
          <p>Tiles and place names come from OpenStreetMap and Nominatim. Driving geometry comes from the public OSRM demo. All three can rate-limit or fail. When they fail, the page shows the error and does not invent a route. Production traffic should move to a dedicated tile and geocoding provider.</p>
        </article>
        <article className="card">
          <h2>Matching</h2>
          <p>After a trip is published, YAANA compares it with other students' open trips in Supabase. A match needs the same travel date, a departure gap of about 30 minutes, nearby pickups or overlapping saved routes, nearby destinations, the same transport mode, and open seats. Both students see the match, get a notification, and accept or decline on their own. The ride is confirmed only after both accept. Chicago board listings are not used as student matches.</p>
        </article>
        <article className="card">
          <h2>The model</h2>
          <p>The Chicago rule score comes from a scikit-learn Random Forest trained on real Chicago rideshare trips from the City of Chicago open data for 25 October 2019. A pair is labeled shareable when the recorded pickups are within 0.8 km, the drop-offs within 1 km, and the starts within 30 minutes. That file does not name which riders shared a car, and the score is not the probability that two DSU students will share a ride. The score is hidden when the departure gap is above 45 minutes, because that is outside the training file. Every training pair used the same transport mode, so the model is not a transport-compatibility judge. Trip length in the training file is miles; the app keeps kilometres and converts only that one feature before scoring.</p>
        </article>
        <article className="card">
          <h2>Safety</h2>
          <p>Meet in a public place, confirm the stop before leaving, and do not share passwords or payment codes. Cancel from My Rides if the plan changes.</p>
        </article>
      </section>
    </>
  );
}
