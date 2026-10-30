import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPinned, Route, Send } from "lucide-react";
import { useAuth } from "../lib/auth";

const steps = [
  {
    tone: "coral",
    icon: MapPinned,
    emoji: "📌",
    title: "Publish your journey",
    lead: "Choose pickup, destination, departure time, transport mode, and available seats.",
    more: "Search real places, wait for the driving service to return road geometry, then publish. The listing stays yours until you cancel it.",
    cta: "Create a trip",
    guestTo: "/register",
    memberTo: "/create-trip",
    detail: "route",
  },
  {
    tone: "sage",
    icon: Route,
    emoji: "🤝",
    title: "Find your route people",
    lead: "Compare route overlap, departure times, available seats, and estimated detours.",
    more: "Comparisons use saved driving geometry, not two pins with the same neighbourhood name. Compatibility is a set of checks, not a guarantee.",
    cta: "Open matches",
    guestTo: "/login",
    memberTo: "/matches",
    detail: "match",
  },
  {
    tone: "sky",
    icon: Send,
    emoji: "🛺",
    title: "Make the journey happen",
    lead: "Send a seat request and wait for the trip owner to accept it.",
    more: "A request is not a reserved seat. The owner can accept or decline. Cancel from Trips if the plan changes.",
    cta: "Find a ride",
    guestTo: "/login",
    memberTo: "/find-rides",
    detail: "request",
  },
];

function StepDetail({ kind }) {
  if (kind === "route") {
    return (
      <div className="how-detail how-detail-route" aria-hidden="true">
        <span className="how-pin how-pin-a">A</span>
        <span className="how-road" />
        <span className="how-pin how-pin-b">B</span>
      </div>
    );
  }
  if (kind === "match") {
    return (
      <div className="how-detail how-detail-match" aria-hidden="true">
        <span>Overlap</span>
        <span>Time</span>
        <span>Seats</span>
      </div>
    );
  }
  return (
    <div className="how-detail how-detail-request" aria-hidden="true">
      <span className="is-pending">Pending</span>
      <span className="is-ok">Accepted</span>
    </div>
  );
}

export default function HowSteps() {
  const { session } = useAuth();
  const baseId = useId();
  const [open, setOpen] = useState(-1);
  const [hover, setHover] = useState(-1);

  return (
    <ol className="how-steps">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const expanded = hover === index || open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-btn-${index}`;
        return (
          <li
            key={step.title}
            className={`how-step how-step-${step.tone}${expanded ? " is-open" : ""}`}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setHover(index);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setHover(-1);
            }}
          >
            <button
              type="button"
              id={buttonId}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => {
                if (typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                  return;
                }
                setOpen(expanded ? -1 : index);
              }}
            >
              <span className="how-step-top">
                <span className="how-num">
                  {String(index + 1).padStart(2, "0")}
                  <span className="peek" aria-hidden="true">{step.emoji}</span>
                </span>
                <span className="how-step-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
              </span>
              <span className="how-step-copy">
                <h3>{step.title}</h3>
                <p>{step.lead}</p>
              </span>
            </button>
            <Link className="how-step-cta text-link" to={session ? step.memberTo : step.guestTo}>
              {step.cta} <ArrowRight size={14} />
            </Link>
            <div className="how-step-more" id={panelId} role="region" aria-labelledby={buttonId} aria-hidden={!expanded}>
              <div className="how-step-more-inner">
                <p>{step.more}</p>
                <StepDetail kind={step.detail} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
