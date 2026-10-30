import { useReducedMotion } from "framer-motion";

function MarqueeCopy({ items, separator }) {
  return (
    <p className="yaana-marquee-copy" aria-hidden="true">
      {items.map((item) => (
        <span key={item}>
          <span>{item}</span>
          <span className="yaana-marquee-sep" aria-hidden="true">{separator}</span>
        </span>
      ))}
    </p>
  );
}

export default function YaanaMarquee({
  items = [],
  background = "#FFC928",
  color = "#071B2D",
  separator = "✳",
  speed = 32,
  label = "YAANA messages",
}) {
  const reduce = useReducedMotion();
  const phrase = items.join(` ${separator} `);

  return (
    <div
      className={`yaana-marquee${reduce ? " is-static" : ""}`}
      style={{
        background,
        color,
        "--marquee-duration": `${speed}s`,
      }}
      role="region"
      aria-label={label}
      tabIndex={reduce ? undefined : 0}
    >
      <p className="sr-only">{phrase}</p>
      {reduce ? (
        <p className="yaana-marquee-static" aria-hidden="true">{phrase}</p>
      ) : (
        <div className="yaana-marquee-track">
          <MarqueeCopy items={items} separator={separator} />
          <MarqueeCopy items={items} separator={separator} />
        </div>
      )}
    </div>
  );
}
