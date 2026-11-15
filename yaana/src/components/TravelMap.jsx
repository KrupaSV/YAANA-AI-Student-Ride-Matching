import { useEffect, useRef, useState } from "react";
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
  useMapEvent,
} from "react-leaflet";
import L from "leaflet";
import { useReducedMotion } from "framer-motion";
import {
  asLatLng,
  asRoute,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from "../lib/map";
import { DESTINATION_SYMBOL, MEETING_SYMBOL, pickupCharacter } from "../lib/mapCharacters";

function pin(color, label) {
  return L.divIcon({
    className: "yaana-pin",
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const stopIcon = pin("#386b58", "+");
const OWN_COLOR = "#195cc3";
const PEER_COLOR = "#b94721";
const SHARED_COLOR = "#156146";
const MATCH_ROUTES = [
  { key: "ownRoute", label: "Your route", color: OWN_COLOR, weight: 7 },
  { key: "peerRoute", label: "Classmate’s route", color: PEER_COLOR, weight: 5, dashArray: "9 8" },
  { key: "shared", label: "Shared stretch", color: SHARED_COLOR, weight: 5 },
];

function placePin(kind, symbols, color, shift = 0) {
  const meeting = kind === "meeting";
  const stemY = meeting ? 12 : -12;
  return L.divIcon({
    className: `yaana-place-pin is-${kind}`,
    html: `<span class="place-pin-art" style="--pin-color:${color};--pin-shift:${shift}px" aria-hidden="true">
      <span class="place-pin-stem" style="width:${Math.hypot(shift, stemY)}px;rotate:${Math.atan2(stemY, shift)}rad"></span>
      <span class="place-pin-dot"></span>
      <span class="place-pin-face">${symbols.map((symbol) => `<span>${symbol}</span>`).join("")}</span>
    </span>`,
    iconSize: meeting ? [28, 40] : [42, 54],
    iconAnchor: meeting ? [14, 2] : [21, 52],
    popupAnchor: meeting ? [0, -4] : [shift, -49],
  });
}

const destinationIcon = placePin("destination", [DESTINATION_SYMBOL], "#246781");
const meetingIcon = placePin("meeting", [MEETING_SYMBOL], SHARED_COLOR);
const NO_STOPS = [];
const NO_LISTINGS = [];

function endpointShift(endpoints, map, zoom) {
  if (endpoints.length !== 2) return 0;
  const [first, second] = endpoints.map(({ position }) => map.project(position, zoom));
  const difference = second.subtract(first);
  if (Math.abs(difference.y) >= 38 || Math.abs(difference.x) >= 46) return 0;
  return (difference.x < 0 ? 1 : -1) * (46 - Math.abs(difference.x)) / 2;
}

function MatchPlacePins({ comparison, characters }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvent("zoomend", () => setZoom(map.getZoom()));

  const pinGroups = [
    { kind: "pickup", endpoints: comparison.pickups },
    { kind: "destination", endpoints: comparison.destinations },
  ];

  return (
    <>
      {pinGroups.flatMap(({ kind, endpoints }) => {
        const firstShift = endpointShift(endpoints, map, zoom);
        return endpoints.map(({ position, riders }, index) => {
          const both = riders.length > 1;
          const title = both
            ? `Same ${kind} for both trips`
            : `${riders[0].owner === "own" ? "Your" : "Classmate’s"} ${kind}`;
          const color = both ? SHARED_COLOR : riders[0].owner === "own" ? OWN_COLOR : PEER_COLOR;
          const symbols = kind === "pickup"
            ? riders.map(({ owner }) => pickupCharacter(characters?.[owner]).symbol)
            : [DESTINATION_SYMBOL];
          return (
            <Marker
              key={`${kind}-${position.join(",")}`}
              position={position}
              icon={placePin(kind, symbols, color, index === 0 ? firstShift : -firstShift)}
              title={title}
            >
              <Popup>
                <strong>{title}</strong>
                {riders.map(({ owner, place }) => (
                  <p key={owner}>{owner === "own" ? "You" : "Classmate"} · {place || "Pinned location"}</p>
                ))}
              </Popup>
            </Marker>
          );
        });
      })}
      {comparison.pickup && (
        <Marker position={comparison.pickup.position} icon={meetingIcon} title="Proposed pickup">
          <Popup>
            <strong>Proposed pickup</strong>
            <p>{comparison.pickup.label}</p>
          </Popup>
        </Marker>
      )}
    </>
  );
}

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

function ViewSync({ pointKey, points, padding, reduce, mapRef }) {
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
    map.fitBounds(points, { padding, maxZoom: 16, animate: !reduce });
  }, [map, pointKey, points, padding, reduce]);
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
  comparisonCharacters,
  originCharacter,
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
    for (const { position } of [...comparison.pickups, ...comparison.destinations]) points.push(position);
    if (comparison.pickup) points.push(comparison.pickup.position);
  }
  const pointKey = points.map((point) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`).join("|");
  const padding = comparison || onMovePin ? [50, 56] : [36, 36];

  function fit() {
    const map = mapRef.current;
    if (!map || points.length < 1) return;
    if (points.length === 1) map.setView(points[0], 15, { animate: !reduce });
    else map.fitBounds(points, { padding, maxZoom: 16, animate: !reduce });
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
        <ViewSync pointKey={fitKey ?? pointKey} points={points} padding={padding} reduce={reduce} mapRef={mapRef} />
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
              interactive={false}
              pathOptions={{ color, weight, dashArray }}
            />
          )
        ))}
        {comparison && <MatchPlacePins comparison={comparison} characters={comparisonCharacters} />}
        {displayOrigin && (
          <Marker
            position={displayOrigin}
            icon={placePin("pickup", [pickupCharacter(originCharacter).symbol], "#a64437")}
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
            icon={destinationIcon}
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
            {comparison.pickups.length > 0 && <li><b aria-hidden="true">{pickupCharacter().symbol}</b> Original pickup</li>}
            {comparison.destinations.length > 0 && <li><b aria-hidden="true">{DESTINATION_SYMBOL}</b> Destination</li>}
            {comparison.pickup && <li><b aria-hidden="true" className="match-legend-meeting">{MEETING_SYMBOL}</b> Proposed pickup</li>}
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
        <li><b aria-hidden="true">{pickupCharacter(originCharacter).symbol}</b> Pickup</li>
        <li><b aria-hidden="true">{DESTINATION_SYMBOL}</b> Destination</li>
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
