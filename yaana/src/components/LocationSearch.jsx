import { useEffect, useId, useState } from "react";
import { searchPlaces } from "../lib/api";
import { placeFromQuery } from "../lib/map";

export default function LocationSearch({ label, placeholder, value, onSelect, onQuery }) {
  const [query, setQuery] = useState(value?.label || "");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const selectedLabel = value?.label || "";

  useEffect(() => {
    if (selectedLabel) setQuery(selectedLabel);
  }, [selectedLabel]);

  const parsed = placeFromQuery(query);
  useEffect(() => {
    if (query.trim().length < 2 || query === value?.label || placeFromQuery(query)) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("Searching places…");
      try {
        const body = await searchPlaces(query.trim(), controller.signal);
        if (controller.signal.aborted) return;
        const remote = body.results || [];
        setResults(remote);
        setActive(-1);
        setStatus(remote.length ? "" : "No matching Bengaluru places. Try another name or enter coordinates.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus(error.message);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value?.label]);

  const options = query === value?.label ? [] : parsed ? [parsed] : results;
  const expanded = open && options.length > 0;

  function choose(place) {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
    setStatus("");
  }

  function onKeyDown(event) {
    if (!expanded) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Enter" && parsed) {
      event.preventDefault();
      choose(parsed);
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
        aria-expanded={expanded}
        aria-controls={expanded ? `${listId}-list` : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-option-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setResults([]);
          setStatus("");
          setActive(-1);
          setOpen(true);
          onQuery?.(next);
        }}
        onKeyDown={onKeyDown}
      />
      {open && query !== value?.label && status && <p className="field-note" role="status">{status}</p>}
      {expanded && (
        <div className="place-list">
          <ul id={`${listId}-list`} role="listbox">
            {options.map((place, index) => (
              <li key={place.id || `${place.lat}-${place.lng}`} role="presentation">
                <button
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "is-active" : ""}
                  onClick={() => choose(place)}
                >
                  {place.label}
                  {place.kind && <small>{[place.kind, place.locality].filter(Boolean).join(" · ")}</small>}
                </button>
              </li>
            ))}
          </ul>
          {!parsed && (
            <small className="place-credit"><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></small>
          )}
        </div>
      )}
    </div>
  );
}
