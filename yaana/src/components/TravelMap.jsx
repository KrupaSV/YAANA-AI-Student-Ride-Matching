import { useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useReducedMotion } from "framer-motion";
import {
  asLatLng,
  asRoute,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from "../lib/map";

function pin(color, label) {
  return L.divIcon({
    className: "yaana-pin",
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const pickupIcon = pin("#e78376", "A");
const dropIcon = pin("#397b98", "B");
const stopIcon = pin("#386b58", "+");
const matchPickupIcon = pin("#156146", "P");
const MATCH_ROUTES = [
  { key: "ownRoute", label: "Your route", color: "#195cc3", weight: 7 },
  { key: "peerRoute", label: "Classmate’s route", color: "#b94721", weight: 5, dashArray: "9 8" },
  { key: "shared", label: "Shared stretch", color: "#156146", weight: 5 },
];
function editPin(color, label) {
  return L.divIcon({
    className: "yaana-pin is-editable",
    html: `<span style="--pin-color:${color}" aria-hidden="true">${label}</span>`,
    iconSize: [42, 44],
    iconAnchor: [21, 44],
    popupAnchor: [0, -38],
  });
}

const editPickupIcon = editPin("#a64437", "A");
const editDropIcon = editPin("#246781", "B");
const NO_STOPS = [];
const NO_LISTINGS = [];

function tripPin(seats, selected) {
  const count = Math.max(0, Number(seats) || 0);
  return L.divIcon({
    className: `yaana-trip-pin${selected ? " is-selected" : ""}`,
    html: `<span>${count}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function ResizeSync() {
  const map = useMap();
  useEffect(() => {
    const node = map.getContainer();
    const frame = () => map.invalidateSize({ animate: false });
    frame();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", frame);
      return () => window.removeEventListener("resize", frame);
    }
    const observer = new ResizeObserver(frame);
    observer.observe(node.parentElement || node);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function ViewSync({ pointKey, points, reduce, mapRef }) {
  const map = useMap();
  const previousKey = useRef();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  useEffect(() => {
    if (previousKey.current === pointKey) return;
    previousKey.current = pointKey;
    if (!points.length) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: !reduce });
      return;
    }
    map.fitBounds(points, { padding: [36, 36], maxZoom: 16, animate: !reduce });
  }, [map, pointKey, points, reduce]);
  return null;
}

function ClickLayer({ onPick }) {
  const map = useMap();
  useEffect(() => {
    if (!onPick) return undefined;
    const node = map.getContainer();
    node.style.cursor = "crosshair";
    const handler = (event) => onPick([event.latlng.lat, event.latlng.lng]);
    map.on("click", handler);
    return () => {
      node.style.cursor = "";
      map.off("click", handler);
    };
  }, [map, onPick]);
  return null;
}

function fitPoints(origin, destination, route, stops, listings) {
  const points = [...asRoute(route)];
  const start = asLatLng(origin);
  const end = asLatLng(destination);
  if (start) points.push(start);
  if (end) points.push(end);
  for (const stop of stops || []) {
    const point = asLatLng(stop);
    if (point) points.push(point);
  }
  for (const item of listings || []) {
    const pickup = asLatLng(item);
    const drop = asLatLng(item.destination);
    if (pickup) points.push(pickup);
    if (drop) points.push(drop);
  }
  return points;
}

function minutesLabel(value) {
  if (value == null || value === "") return null;
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export default function TravelMap({
  origin,
  destination,
  route = [],
  stops = NO_STOPS,
  originLabel,
  destinationLabel,
  distanceKm,
  durationMin,
  transportMode,
  selected = true,
  loading = false,
  error = "",
  tileError = false,
  onTileError,
  onPick,
  onMovePin,
  centerLabel = "Pin at map center",
  fitKey,
  compact = false,
  interactive,
  listings = NO_LISTINGS,
  onSelectListing,
  emptyHint,
  quiet = false,
  comparison,
}) {
  const reduce = useReducedMotion();
  const mapRef = useRef(null);
  const canPick = interactive ?? Boolean(onPick);
  const displayOrigin = asLatLng(origin);
  const displayDrop = asLatLng(destination);
  const displayRoute = asRoute(route);
  const listingCount = listings.length;
  const displayStops = stops;
  const pickupName = originLabel || origin?.label || "Pickup";
  const dropName = destinationLabel || destination?.label || "Destination";
  const km = distanceKm;
  const minutes = durationMin;
  const isLoading = loading;
  const missingPoints = !displayOrigin && !displayDrop && listingCount === 0;
  const points = fitPoints(displayOrigin, displayDrop, displayRoute, displayStops, listings);
  if (comparison) {
    for (const { key } of MATCH_ROUTES) {
      if (key !== "shared") {
        for (const point of comparison[key]) points.push(point);
      }
    }
    if (comparison.pickup) points.push(comparison.pickup.position);
  }
  const pointKey = points.map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`).join("|");

  function fit() {
    const map = mapRef.current;
    if (!map || points.length < 1) return;
    if (points.length === 1) map.setView(points[0], 15, { animate: !reduce });
    else map.fitBounds(points, { padding: [36, 36], maxZoom: 16, animate: !reduce });
  }

  function pickCenter() {
    const center = mapRef.current?.getCenter();
    if (center) onPick([center.lat, center.lng]);
  }

  function movePin(endpoint, event) {
    const { lat, lng } = event.target.getLatLng();
    onMovePin(endpoint, [lat, lng]);
  }

  const overlay = isLoading
    ? "Calculating the road route…"
    : tileError
      ? "Map tiles could not be loaded. Check the network connection."
      : error;
  const hint = !overlay && missingPoints
    ? (emptyHint || "Choose a pickup and destination to see the driving route.")
    : !overlay && displayRoute.length < 2 && (displayOrigin || displayDrop || listingCount)
      ? (listingCount && !displayOrigin
        ? "Select a published trip to see its saved driving route."
        : "A driving line appears when the routing service returns a route.")
      : "";

  return (
    <div className={`map-frame travel-map${compact ? " is-compact" : ""}${quiet ? " is-quiet" : ""}${comparison ? " is-comparison" : ""}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={!reduce}
        attributionControl
        keyboard
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={onTileError ? { tileerror: () => onTileError() } : undefined}
        />
        {quiet ? null : <ScaleControl imperial={false} />}
        <ResizeSync />
        <ViewSync pointKey={fitKey ?? pointKey} points={points} reduce={reduce} mapRef={mapRef} />
        {canPick && onPick ? <ClickLayer onPick={onPick} /> : null}
        {displayRoute.length > 1 && (
          <>
            <Polyline
              positions={displayRoute}
              pathOptions={{ color: "#ffffff", weight: reduce ? 6 : 8, opacity: 1, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={displayRoute}
              pathOptions={{
                color: selected ? "#386b58" : "#397b98",
                weight: selected ? (reduce ? 4 : 5) : 3,
                opacity: 1,
                lineCap: "round",
                lineJoin: "round",
              }}
            >
              <Tooltip sticky>
                Driving route
              </Tooltip>
            </Polyline>
          </>
        )}
        {comparison && MATCH_ROUTES.map(({ key, color, weight, dashArray }) => (
          comparison[key].length > 0 && (
            <Polyline
              key={key}
              positions={comparison[key]}
              pathOptions={{ className: `match-map-${key}`, color, weight, dashArray, interactive: false }}
            />
          )
        ))}
        {comparison?.pickup && (
          <Marker position={comparison.pickup.position} icon={matchPickupIcon} title="Proposed pickup">
            <Popup>
              <strong>Proposed pickup</strong>
              <p>{comparison.pickup.label}</p>
            </Popup>
          </Marker>
        )}
        {displayOrigin && (
          <Marker
            position={displayOrigin}
            icon={onMovePin ? editPickupIcon : pickupIcon}
            title="Pickup pin"
            draggable={Boolean(onMovePin)}
            eventHandlers={onMovePin ? { dragend: (event) => movePin("pickup", event) } : undefined}
          >
            <Popup>
              <strong>Pickup</strong>
              <p>{pickupName}</p>
            </Popup>
          </Marker>
        )}
        {displayDrop && (
          <Marker
            position={displayDrop}
            icon={onMovePin ? editDropIcon : dropIcon}
            title="Destination pin"
            draggable={Boolean(onMovePin)}
            eventHandlers={onMovePin ? { dragend: (event) => movePin("destination", event) } : undefined}
          >
            <Popup>
              <strong>Destination</strong>
              <p>{dropName}</p>
            </Popup>
          </Marker>
        )}
        {listings.map((item) => {
          const point = asLatLng(item);
          if (!point) return null;
          return (
            <Marker
              key={item.id}
              position={point}
              icon={tripPin(item.seats, item.selected)}
              eventHandlers={{
                click: () => onSelectListing?.(item.id),
              }}
            >
              <Popup>
                <strong>{item.label || "Published trip"}</strong>
                <p>
                  {Math.max(0, Number(item.seats) || 0)} open seats
                  {item.time ? ` · ${item.time}` : ""}
                </p>
              </Popup>
            </Marker>
          );
        })}
        {displayStops.map((stop, index) => {
          const point = asLatLng(stop);
          if (!point) return null;
          const label = stop.label || "Shared stop";
          return stop.kind === "transport" ? (
            <CircleMarker
              key={`stop-${index}`}
              center={point}
              radius={8}
              pathOptions={{ color: "#397b98", fillColor: "#a8d5e5", fillOpacity: 1, weight: 2 }}
            >
              <Popup>
                <strong>Transport stop</strong>
                <p>{label}</p>
              </Popup>
            </CircleMarker>
          ) : (
            <Marker key={`stop-${index}`} position={point} icon={stopIcon}>
              <Popup>
                <strong>Shared stop</strong>
                <p>{label}</p>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {comparison && (
        <div className="match-map-toolbar">
          <ul className="match-map-legend" aria-label="Route comparison legend">
            {MATCH_ROUTES.filter(({ key }) => comparison[key].length > 0).map(({ key, label, color, dashArray }) => (
              <li key={key}>
                <span aria-hidden="true" className={dashArray ? "is-dashed" : undefined} style={{ borderColor: color }} />
                {label}
              </li>
            ))}
          </ul>
          <button className="map-fit" type="button" onClick={fit}>Fit routes</button>
        </div>
      )}

      {onMovePin && (
        <>
          {canPick && <span className="map-center-target" aria-hidden="true" />}
          <div className="map-editor-actions">
            {canPick && <button className="map-fit" type="button" onClick={pickCenter}>{centerLabel}</button>}
            {points.length > 0 && <button className="map-fit" type="button" onClick={fit}>Fit map</button>}
          </div>
        </>
      )}

      {!quiet && (
      <aside className="map-panel" aria-label="Route information">
        <p className="map-kicker">
          {listingCount && !displayOrigin ? "Published trips" : "Route"}
        </p>
        <strong>
          {displayOrigin
            ? `${pickupName} → ${dropName}`
            : listingCount
              ? `${listingCount} published ${listingCount === 1 ? "trip" : "trips"}`
              : "No route selected"}
        </strong>
        {km != null && Number.isFinite(Number(km)) ? (
          <p>{Number(km).toFixed(1)} km{minutesLabel(minutes) ? ` · ${minutesLabel(minutes)}` : ""}{transportMode ? ` · ${transportMode}` : ""}</p>
        ) : displayRoute.length > 1 ? (
          <p>Road geometry loaded{transportMode ? ` · ${transportMode}` : ""}.</p>
        ) : listingCount ? (
          <p>Numbers on markers are open seats. Select a trip to inspect its road.</p>
        ) : (
          <p>Waiting for road geometry.</p>
        )}
        <button className="map-fit" type="button" onClick={fit} disabled={points.length === 0}>
          Fit map
        </button>
      </aside>
      )}

      {!quiet && (
      <ul className="map-legend" aria-label="Map legend">
        <li><i className="map-swatch map-swatch-a" /> Pickup</li>
        <li><i className="map-swatch map-swatch-b" /> Destination</li>
        <li><i className="map-swatch map-swatch-route" /> Driving route</li>
        {displayStops.length > 0 && <li><i className="map-swatch map-swatch-stop" /> Shared stop</li>}
        {listingCount > 0 && <li><i className="map-swatch map-swatch-trip" /> Trip pickup · open seats</li>}
      </ul>
      )}

      {!quiet && overlay && (
        <p className={`map-status${isLoading ? " is-loading" : ""}`} role="status">
          {overlay}
        </p>
      )}
      {!quiet && !overlay && hint && !compact && (
        <p className="map-status" role="status">{hint}</p>
      )}

      {!quiet && (
      <p className="map-note">
        {listingCount
          ? "Markers show published trips with open seats."
          : "Places and streets from OpenStreetMap. Driving directions from OSRM."}
      </p>
      )}
      <span className="sr-only">Bengaluru trip map</span>
    </div>
  );
}
