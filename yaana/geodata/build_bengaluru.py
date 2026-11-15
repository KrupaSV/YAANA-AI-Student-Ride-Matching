"""Build the Bengaluru place catalog from a Geofabrik Southern Zone OSM extract."""

import argparse
from collections import Counter
import gzip
import io
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

import osmium

from .places import CATALOG_PATH, normalize


SOURCE_URL = "https://download.geofabrik.de/asia/india/southern-zone.html"
BOUNDS = (12.63, 77.39, 13.24, 77.86)
PLACE_TYPES = {"city", "town", "village", "suburb", "neighbourhood", "quarter", "hamlet", "locality"}
ROAD_TYPES = {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street"}
LANDMARK_TYPES = {
    "college", "university", "school", "hospital", "clinic", "marketplace", "library", "community_centre",
    "place_of_worship", "fuel", "townhall", "cinema", "theatre",
}
NAME_TAGS = ("name:en", "name", "name:kn", "alt_name", "alt_name:en", "official_name", "short_name", "loc_name")


def place_kind(tags):
    if tags.get("access") in {"private", "no"}:
        return None
    if tags.get("aeroway") in {"aerodrome", "terminal"}:
        return "Airport"
    if tags.get("railway") == "construction" or tags.get("construction") in {"station", "subway"}:
        return None
    is_station = tags.get("railway") == "station" or tags.get("public_transport") == "station"
    if is_station and (tags.get("station") == "subway" or tags.get("subway") == "yes"):
        return "Metro station"
    if tags.get("railway") in {"station", "halt", "tram_stop"}:
        return "Railway station"
    if tags.get("amenity") == "bus_station":
        return "Bus terminal"
    if tags.get("highway") == "bus_stop" or tags.get("public_transport") == "platform" and tags.get("bus") == "yes":
        return "Bus stop"
    if tags.get("place") in PLACE_TYPES:
        return "Locality"
    if tags.get("amenity") in LANDMARK_TYPES:
        return tags["amenity"].replace("_", " ").capitalize()
    if tags.get("shop") in {"mall", "supermarket", "department_store"}:
        return tags["shop"].replace("_", " ").capitalize()
    if tags.get("leisure") in {"park", "stadium", "sports_centre", "garden"}:
        return tags["leisure"].replace("_", " ").capitalize()
    if tags.get("tourism") in {"attraction", "museum", "hotel", "zoo"}:
        return tags["tourism"].capitalize()
    if tags.get("highway") in ROAD_TYPES:
        return "Road"
    return None


def representative_point(element, kind):
    if element.is_node():
        return (element.lat, element.lon) if element.location.valid() else None
    if not element.is_way():
        return None
    points = [(node.lat, node.lon) for node in element.nodes if node.location.valid()]
    if not points:
        return None
    if kind == "Road" or points[0] != points[-1]:
        return points[len(points) // 2]
    # A mapped area uses its bounding box centre. It represents the site, not an entrance.
    latitudes, longitudes = zip(*points)
    return (min(latitudes) + max(latitudes)) / 2, (min(longitudes) + max(longitudes)) / 2


def read_places(path):
    south, west, north, east = BOUNDS
    processor = (
        osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.KeyFilter("name", "name:en", "name:kn"))
    )
    for element in processor:
        if element.is_node() and not (south <= element.lat <= north and west <= element.lon <= east):
            continue
        kind = place_kind(element.tags)
        if kind is None:
            continue
        names = [
            name.strip()
            for key in NAME_TAGS
            for name in element.tags.get(key, "").split(";")
            if len(normalize(name)) >= 2
        ]
        if not names:
            continue
        point = representative_point(element, kind)
        if point is None:
            continue
        lat, lng = point
        if not (south <= lat <= north and west <= lng <= east):
            continue
        locality = element.tags.get("addr:suburb") or element.tags.get("addr:place") or ""
        yield {
            "id": f"{element.type_str()}{element.id}",
            "name": names[0],
            "aliases": list(dict.fromkeys(names[1:])),
            "kind": kind,
            "locality": locality,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
        }


def deduplicate(places):
    # Nearby OSM nodes and areas may describe the same place. Keep distinct locations.
    by_name = {}
    for place in places:
        key = (normalize(place["name"]), place["kind"])
        nearby = by_name.setdefault(key, [])
        threshold = 0.004 if place["kind"] == "Road" else 0.00075
        for existing in nearby:
            if abs(place["lat"] - existing["lat"]) <= threshold and abs(place["lng"] - existing["lng"]) <= threshold:
                existing["aliases"] = sorted(set(existing["aliases"]) | set(place["aliases"]))
                if not existing["locality"]:
                    existing["locality"] = place["locality"]
                break
        else:
            nearby.append(place)
            yield place


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbf", type=Path)
    args = parser.parse_args()
    with osmium.io.Reader(args.pbf) as reader:
        timestamp = reader.header().get("osmosis_replication_timestamp")
    places = sorted(deduplicate(read_places(args.pbf)), key=lambda place: place["id"])
    if not places:
        raise SystemExit("The extract yielded no named Bengaluru places.")
    counts = dict(sorted(Counter(place["kind"] for place in places).items()))
    catalog = {
        "area": "Bengaluru and DSU commute area",
        "bounds": BOUNDS,
        "source": SOURCE_URL,
        "source_timestamp": timestamp,
        "license": "https://opendatacommons.org/licenses/odbl/1-0/",
        "counts": counts,
        "places": places,
    }
    with NamedTemporaryFile(dir=CATALOG_PATH.parent, delete=False) as temporary:
        temp_path = Path(temporary.name)
    try:
        with temp_path.open("wb") as output:
            with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
                with io.TextIOWrapper(compressed, encoding="utf-8") as stream:
                    json.dump(catalog, stream, ensure_ascii=False, separators=(",", ":"))
                    stream.write("\n")
        temp_path.replace(CATALOG_PATH)
    finally:
        temp_path.unlink(missing_ok=True)
    print(f"Saved {len(places):,} places to {CATALOG_PATH.name} from OSM data dated {timestamp}.")
    print(counts)


if __name__ == "__main__":
    main()
