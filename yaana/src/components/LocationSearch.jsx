import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces } from "../lib/api";

export default function LocationSearch({ label, placeholder, value, onSelect, onQuery }) {
  const [query, setQuery] = useState(value?.label || "");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const request = useRef(0);

  useEffect(() => {
    setQuery(value?.label || "");
  }, [value?.label]);

  useEffect(() => {
    if (query.trim().length < 3 || query === value?.label) {
      setResults([]);
      setStatus("");
      return undefined;
    }

    const current = ++request.current;
    const timer = setTimeout(async () => {
      setStatus("Searching places…");
      try {
        const body = await searchPlaces(query.trim());
        if (current !== request.current) return;
        setResults(body.results || []);
        setOpen(true);
        setActive(-1);
        setStatus(body.results?.length ? "" : "No matching places. Try a more specific name.");
      } catch (error) {
        if (current !== request.current) return;
        setResults([]);
        setStatus(error.status === 429
          ? "Place search is cooling down. Wait a second."
          : error.message);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [query, value?.label]);

  function choose(place) {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
    setStatus("");
  }

  function onKeyDown(event) {
    if (!open || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="field place-field">
      <label htmlFor={listId}>{label}</label>
      <input
        id={listId}
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          onQuery?.(next);
        }}
        onKeyDown={onKeyDown}
      />
      {status && <p className="field-note" role="status">{status}</p>}
      {open && results.length > 0 && (
        <ul className="place-list" id={`${listId}-list`} role="listbox">
          {results.map((place, index) => (
            <li key={`${place.lat}-${place.lng}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "is-active" : ""}
                onClick={() => choose(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
