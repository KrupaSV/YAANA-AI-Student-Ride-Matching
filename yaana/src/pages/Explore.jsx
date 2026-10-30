
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, MapPin, Clock3, ArrowRight, CarFront,
  UsersRound, Sparkles
} from "lucide-react";

export default function Explore() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  return (
    <main className="explore-page">
      <section className="page-container page-section">
        <div className="explore-heading">
          <span className="eyebrow">Your next destination</span>
          <h1 className="display-serif">
            Where are we <span className="pink-text">going?</span>
          </h1>
          <p>Find your route, meet fellow students, and make the commute easier.</p>
        </div>

        <div className="explore-search card">
          <div className="field">
            <label htmlFor="from">Starting point</label>
            <div className="input-with-icon">
              <MapPin size={18} />
              <input
                id="from"
                className="input"
                placeholder="e.g. DSU Campus"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="to">Going to</label>
            <div className="input-with-icon">
              <MapPin size={18} />
              <input
                id="to"
                className="input"
                placeholder="e.g. BTM Layout"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
          </div>

          <Link
            className="btn btn-primary"
            to={`/find-rides?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`}
          >
            <Search size={17} /> Find rides
          </Link>
        </div>

        <div className="explore-section-title">
          <div>
            <span className="eyebrow">Made for your commute</span>
            <h2>Choose your way</h2>
          </div>
        </div>

        <div className="grid-3">
          <Link to="/find-rides" className="explore-option explore-option-pink">
            <span className="explore-option-icon"><UsersRound size={24} /></span>
            <span className="explore-option-kicker">01 / COMMUNITY</span>
            <h3>Shared rides</h3>
            <p>Discover students travelling in the same direction.</p>
            <span className="explore-option-link">Explore rides <ArrowRight size={16} /></span>
          </Link>

          <Link to="/book-auto" className="explore-option explore-option-lilac">
            <span className="explore-option-icon"><CarFront size={24} /></span>
            <span className="explore-option-kicker">02 / AUTO</span>
            <h3>Book an auto</h3>
            <p>Find the auto-booking options available in YAANA.</p>
            <span className="explore-option-link">Find an auto <ArrowRight size={16} /></span>
          </Link>

          <Link to="/create-trip" className="explore-option explore-option-peach">
            <span className="explore-option-icon"><Sparkles size={24} /></span>
            <span className="explore-option-kicker">03 / YOUR TURN</span>
            <h3>Share your trip</h3>
            <p>Heading somewhere? Let other students join your journey.</p>
            <span className="explore-option-link">Create a trip <ArrowRight size={16} /></span>
          </Link>
        </div>

        <div className="explore-tip">
          <span className="explore-tip-icon"><Clock3 size={20} /></span>
          <div>
            <strong>Your journey, your schedule.</strong>
            <p>Search by route and compare the trips currently available.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
