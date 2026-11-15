import TravelMap from "./TravelMap";

export default function MapPicker({
  origin,
  destination,
  route = [],
  stops,
  originLabel,
  destinationLabel,
  distanceKm,
  durationMin,
  transportMode,
  selected,
  loading,
  error,
  tileError,
  onTileError,
  onPick,
  onMovePin,
  centerLabel,
  fitKey,
  quiet,
  compact,
}) {
  return (
    <TravelMap
      origin={origin}
      destination={destination}
      route={route}
      stops={stops}
      originLabel={originLabel}
      destinationLabel={destinationLabel}
      distanceKm={distanceKm}
      durationMin={durationMin}
      transportMode={transportMode}
      selected={selected}
      loading={loading}
      error={error}
      tileError={tileError}
      onTileError={onTileError}
      onPick={onPick}
      onMovePin={onMovePin}
      centerLabel={centerLabel}
      fitKey={fitKey}
      quiet={quiet}
      compact={compact}
    />
  );
}
