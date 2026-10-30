import TravelMap from "./TravelMap";

export default function RouteArt({ trip }) {
  if (trip && Number.isFinite(Number(trip.origin_lat)) && Number.isFinite(Number(trip.destination_lat))) {
    return (
      <TravelMap
        origin={[trip.origin_lat, trip.origin_lng]}
        destination={[trip.destination_lat, trip.destination_lng]}
        originLabel={trip.origin_name}
        destinationLabel={trip.destination_name}
        route={trip.route_geometry}
        distanceKm={trip.distance_km}
        durationMin={trip.duration_min}
        transportMode={trip.transport_mode}
        compact
        quiet
      />
    );
  }
  return <TravelMap preview compact quiet />;
}
