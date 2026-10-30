import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Leaf, Route, Shield } from "lucide-react";
import Logo from "../components/Logo";
import PublicHeader from "../components/PublicHeader";
import HowSteps from "../components/HowSteps";
import ExploreBoard from "../components/ExploreBoard";
import YaanaMarquee from "../components/YaanaMarquee";
import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/useTitle";

const faqs = [
  [
    "Who can join YAANA?",
    "Registration currently accepts exact addresses from configured eligible domains, beginning with @dsu.edu.in. An allowed domain starts the process; it is not a university roster check. Matching stays closed until the confirmation link establishes a confirmed session.",
    "🎓",
  ],
  [
    "Can I travel with someone going to the same area?",
    "Yes, when a published trip follows similar roads at a compatible time with an open seat. Matching uses saved driving geometry, not just the same neighbourhood name. A nearby pin is not enough.",
    "📍",
  ],
  [
    "Does a seat request mean my seat is confirmed?",
    "No. A request stays pending until the trip owner accepts or declines it. The seat is not reserved until acceptance succeeds.",
    "🎟️",
  ],
  [
    "What if nobody is heading my way?",
    "The board stays empty. Publish your own journey so later students can find it, or try another destination. YAANA never invents a match to fill the layout.",
    "🌱",
  ],
  [
    "Can I cancel a request?",
    "Yes. Pending and accepted requests can be cancelled from Trips. Database rules return an accepted seat only after cancellation succeeds.",
    "↩️",
  ],
  [
    "Does YAANA guarantee a perfect match?",
    "No. Road overlap, departure gap, estimated detour, open seats, and a Chicago rule score from real Chicago rideshare trips are checks, not a promise. That score is not the chance two DSU students will share a ride. Hard constraints such as no remaining seats still win.",
    "🎯",
  ],
  [
    "Do I have to share a ride every day?",
    "No. Publish or request only when you have a real trip. There is no daily quota and no penalty for sitting a day out.",
    "🌤️",
  ],
  [
    "What if I am running late?",
    "Coordinate after a request is accepted. If you cannot make the departure, cancel from Trips so the seat can return.",
    "⏰",
  ],
];

export default function Landing() {
  useTitle("Your campus. Your route. Your people.");
  const reduce = useReducedMotion();
  const { session, isTestingRegistration: testing } = useAuth();
  const faqItems = useMemo(() => faqs.map((item, index) => {
    if (index !== 0) return item;
    return [
      item[0],
      testing
        ? "Temporary testing mode accepts any valid email, including Gmail and Outlook. A USN is not required. Opening the confirmation link is still required before matching. Production registration returns to approved college domains, beginning with @dsu.edu.in."
        : item[1],
      item[2],
    ];
  }), [testing]);
  const [open, setOpen] = useState(-1);
  const reveal = useMemo(() => (
    reduce ? {} : {
      initial: { opacity: 0, y: 10 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true, amount: 0.2 },
      transition: { duration: 0.4, ease: "easeOut" },
    }
  ), [reduce]);
  const partnerTo = session ? "/find-rides" : "/register";

  return (
    <div className="home">
      <a className="skip-link" href="#content">Skip to content</a>
      <PublicHeader />

      <main id="content">
        <section className="landing-hero">
          <motion.div className="hero-copy" {...(reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45 } })}>
            <p className="eyebrow">Dayananda Sagar University <span className="peek" aria-hidden="true">🎓</span></p>
            <h1>
              Your campus.<br />
              Your route.<br />
              Your <em>people.</em> <span className="peek peek-title" aria-hidden="true">✨</span>
            </h1>
            <p className="lede">Find verified DSU students travelling your way and share your commute, safely and easily.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to={partnerTo}>Find your people <ArrowRight size={16} /></Link>
              <a className="btn btn-secondary" href="#how">See how it works</a>
            </div>
          </motion.div>
          <ul className="hero-benefits">
            <li>
              <BadgeCheck size={18} aria-hidden="true" />
              <span>Verified DSU students</span>
            </li>
            <li>
              <Route size={18} aria-hidden="true" />
              <span>Shared routes</span>
            </li>
            <li>
              <Shield size={18} aria-hidden="true" />
              <span>Safer commute</span>
            </li>
            <li>
              <Leaf size={18} aria-hidden="true" />
              <span>More sustainable</span>
            </li>
          </ul>

          <motion.figure className="hero-visual" {...(reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.06 } })}>
            <img
              src="/hero-campus.jpg?v=right"
              alt="Illustrated Dayananda Sagar University Innovation Campus with a green-and-yellow YAANA auto marked 09, students, fountain, and a coral route to campus."
              width="1536"
              height="1024"
            />
          </motion.figure>
        </section>

        <YaanaMarquee
          items={[
            "YOUR CAMPUS, YOUR PEOPLE",
            "SAME ROUTE, NEW CONNECTIONS",
            "DSU STUDENTS, TRAVEL TOGETHER",
            "LESS SOLO TRAVEL",
            "MORE CAMPUS MEMORIES",
          ]}
          background="#FFC928"
          color="#071B2D"
          speed={34}
          label="Campus travel messages"
        />

        <section className="journey-section" id="how">
          <div className="section-intro">
            <p className="eyebrow">How it works</p>
            <h2>Three little steps. Better journeys. <span className="peek peek-title" aria-hidden="true">🗺️</span></h2>
            <p>From your first trip post to a seat beside someone heading your way.</p>
          </div>
          <HowSteps />
        </section>

        <YaanaMarquee
          items={[
            "THREE LITTLE STEPS",
            "PUBLISH YOUR JOURNEY",
            "FIND YOUR PEOPLE",
            "MAKE THE JOURNEY HAPPEN",
            "SAME CAMPUS, SAME ROADS",
          ]}
          background="#08794F"
          color="#FFF8EC"
          speed={32}
          label="How it works messages"
        />

        <section className="match-band">
          <div className="match-copy">
            <p className="eyebrow">Matching <span className="peek" aria-hidden="true">🔍</span></p>
            <h2>Compatibility is a set of checks, not a vibe.</h2>
            <p>YAANA stores the driving route returned during trip creation. It can then compare how roads overlap, how far departure times differ, and how much extra driving a pickup may require.</p>
          </div>
        </section>

        <YaanaMarquee
          items={[
            "YOUR NEXT RIDE STARTS HERE",
            "FIND YOUR PEOPLE",
            "SHARED RIDES, BETTER ROUTES",
            "FROM HOSTEL TO B GATE",
            "LET’S GO TOGETHER",
          ]}
          background="#FF5C78"
          color="#FFF8EC"
          speed={36}
          label="Ride matching messages"
        />

        <section className="explore-section" id="explore">
          <motion.div className="section-intro" {...reveal}>
            <p className="eyebrow">Explore</p>
            <h2>Little tricks. Real roads. <span className="peek peek-title" aria-hidden="true">🧭</span></h2>
            <p>Cute ways to use YAANA, then a pocket map of published trips — never invented ones.</p>
          </motion.div>
          <ExploreBoard />
        </section>

        <YaanaMarquee
          items={[
            "PEEK THE ROADS",
            "REAL TRIPS ONLY",
            "EMPTY MEANS EMPTY",
            "FIND YOUR ROUTE",
            "LET’S GO TOGETHER",
          ]}
          background="#071B2D"
          color="#FFC928"
          speed={33}
          label="Explore messages"
        />

        <section className="section-shell faq-section" id="faq">
          <div className="section-intro">
            <p className="eyebrow">Frequently asked</p>
            <h2>Know your ride before you ride. <span className="peek peek-title" aria-hidden="true">💬</span></h2>
            <p>Good questions. Clear answers. Fewer awkward first-ride moments.</p>
          </div>
          <div className="faq">
            {faqItems.map(([question, answer, emoji], index) => {
              const expanded = open === index;
              const panelId = `faq-panel-${index}`;
              const buttonId = `faq-btn-${index}`;
              return (
                <article key={question} className={`faq-item faq-tone-${index % 4}${expanded ? " is-open" : ""}`}>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? -1 : index)}
                  >
                    <span>
                      <span className="peek" aria-hidden="true">{emoji}</span>
                      {question}
                    </span>
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>
                  <div className={`faq-panel ${expanded ? "is-open" : ""}`} id={panelId} role="region" aria-labelledby={buttonId}>
                    <div><p aria-hidden={!expanded}>{answer}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="faq-cta">
            <p>Ready to look for someone already on your road?</p>
            <Link className="btn btn-primary" to={partnerTo}>Find a travel partner <ArrowRight size={15} /></Link>
          </div>
        </section>

        <YaanaMarquee
          items={[
            "KNOW YOUR RIDE",
            "ASK AWAY",
            "SAFER COMMUTE",
            "YOUR PEOPLE ARE WAITING",
            "READY WHEN YOUR ROUTE IS",
          ]}
          background="#168ED0"
          color="#FFF8EC"
          speed={35}
          label="FAQ messages"
        />

        <section className="closing-section">
          <div className="closing-panel">
            <div>
              <p className="eyebrow">Ready when your route is</p>
              <h2>Same campus. Similar roads. Your people.</h2>
              <p>
                {testing
                  ? "Use any valid email while testing. A USN is not required. YAANA waits for the confirmation link before matching features open."
                  : "Use your eligible college email. YAANA waits for the confirmation link before matching features open."}
              </p>
            </div>
            <div className="closing-actions">
              <Link className="btn btn-primary" to="/register">Find your people <ArrowRight size={16} /></Link>
              <Link className="btn btn-secondary" to="/login">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div>
          <Link to="/" aria-label="YAANA home" className="brand-lockup">
            <Logo className="logo-mark logo-footer" />
          </Link>
          <p>Student ride matching for eligible Dayananda Sagar University accounts.</p>
        </div>
        <nav aria-label="Footer">
          <Link to="/">Home</Link>
          <Link to="/#how">How It Works</Link>
          <Link to="/#explore">Explore</Link>
          <Link to="/#faq">FAQs</Link>
          <Link to="/login">Log in</Link>
          <Link to="/register">Get started</Link>
        </nav>
      </footer>
    </div>
  );
}
