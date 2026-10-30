import { useTitle } from "../lib/useTitle";

export default function Help() {
  useTitle("Help");
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Help</p>
        <h1>How YAANA works in practice.</h1>
      </header>
      <section className="stack">
        <article className="card">
          <h2>Verification</h2>
          <p>An address must use an exact allowed domain, currently @dsu.edu.in unless the project owner adds another domain in the database and the frontend environment. Opening the confirmation email marks the profile verified. YAANA does not check a university roster.</p>
        </article>
        <article className="card">
          <h2>Maps</h2>
          <p>Tiles and place names come from OpenStreetMap and Nominatim. Driving geometry comes from the public OSRM demo. All three can rate-limit or fail. When they fail, the page shows the error and does not invent a route. Production traffic should move to a dedicated tile and geocoding provider.</p>
        </article>
        <article className="card">
          <h2>Matching</h2>
          <p>Overlap is the share of sampled points on two saved road routes that fall within 400 metres. Detour is the extra OSRM driving distance to serve the other pickup and drop. Straight-line destination separation is labelled separately. Seats and a detour above your saved limit block a recommendation even if the model score is high.</p>
        </article>
        <article className="card">
          <h2>The model</h2>
          <p>The classifier is a scikit-learn Random Forest trained on real Chicago rideshare trips from the City of Chicago open data for 25 October 2019. A pair is labeled shareable when the recorded pickups are within 0.8 km, the drop-offs within 1 km, and the starts within 30 minutes. That file does not name which riders shared a car, and it is not DSU commute history. A high score still does not override open seats or your detour limit.</p>
        </article>
        <article className="card">
          <h2>Safety</h2>
          <p>Meet in a public place, confirm the stop before leaving, and do not share passwords or payment codes. Cancel from My Rides if the plan changes.</p>
        </article>
      </section>
    </>
  );
}
