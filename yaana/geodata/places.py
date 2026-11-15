"""Local autocomplete and nearby landmark labels for Greater Bengaluru."""

from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
import gzip
from itertools import chain
import json
from math import cos, floor, radians
from pathlib import Path
import unicodedata


DATA_DIR = Path(__file__).resolve().parent
CATALOG_PATH = DATA_DIR / "bengaluru_places.json.gz"
ALIASES_PATH = DATA_DIR / "local_aliases.json"
CAMPUS_PLACES_PATH = DATA_DIR / "campus_places.json"
ATTRIBUTION = "© OpenStreetMap contributors"
SOURCE = "YAANA Bengaluru place catalog"

KIND_RANK = {
    "Airport": 0, "University": 1, "Locality": 2, "Metro station": 3, "Railway station": 3,
    "Bus terminal": 4, "College": 5, "Bus stop": 8, "Road": 9,
}
CELL_SCALE = 100
NEARBY_LIMIT_M = 120


def normalize(text):
    text = unicodedata.normalize("NFKC", text).casefold().replace("\u200c", "").replace("\u200d", "")
    # Combining marks are significant in Kannada place names.
    cleaned = "".join(
        char if char.isalnum() or unicodedata.category(char).startswith("M") else " "
        for char in text
    )
    return " ".join(cleaned.split())


def cell(lat, lng):
    return floor(lat * CELL_SCALE), floor(lng * CELL_SCALE)


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    kind: str
    locality: str
    lat: float
    lng: float
    names: tuple[str, ...]
    curated: bool
    source_url: str | None

    def result(self):
        return {
            "id": self.id,
            "label": self.name,
            "kind": self.kind,
            "locality": self.locality,
            "lat": self.lat,
            "lng": self.lng,
            **({"source_url": self.source_url} if self.source_url else {}),
        }


def rank_name(name, query, tokens):
    if name == query:
        return 0
    if name.startswith(query):
        return 1
    if all(any(word.startswith(token) for word in name.split()) for token in tokens):
        return 2
    return 3


class PlaceCatalog:
    def __init__(self, catalog, overrides, campus_places):
        self.source_timestamp = catalog["source_timestamp"]
        self.places = []
        self.by_token = defaultdict(set)
        self.by_cell = defaultdict(list)
        for row in chain(catalog["places"], campus_places):
            override = overrides.get(row["id"], {})
            name = override.get("label", row["name"])
            search_names = [name, row["name"], *row["aliases"], *override.get("aliases", [])]
            if row["kind"] in {"Metro station", "Railway station", "Bus stop", "Bus terminal"}:
                search_names.append(f'{row["name"]} {row["kind"]}')
            if row["locality"]:
                search_names.append(f'{row["name"]} {row["locality"]}')
            names = tuple(dict.fromkeys(map(normalize, search_names)))
            source_url = row.get("source_url")
            place = Place(
                row["id"], name, row["kind"], row["locality"], row["lat"], row["lng"],
                names, bool(override or source_url), source_url,
            )
            index = len(self.places)
            self.places.append(place)
            for token in set(" ".join(names).split()):
                self.by_token[token].add(index)
            if place.kind != "Road":
                self.by_cell[cell(place.lat, place.lng)].append(place)
        self.tokens = sorted(self.by_token)

    def _prefix_matches(self, prefix):
        matches = set()
        for index in range(bisect_left(self.tokens, prefix), len(self.tokens)):
            token = self.tokens[index]
            if not token.startswith(prefix):
                break
            matches.update(self.by_token[token])
        return matches

    def search(self, text, limit=8):
        query = normalize(text)
        if len(query) < 2:
            return []
        tokens = query.split()
        candidates = set.intersection(*(self._prefix_matches(token) for token in tokens))
        ranked = []
        for index in candidates:
            place = self.places[index]
            name_rank = min(rank_name(name, query, tokens) for name in place.names)
            if name_rank < 3:
                rank = (
                    name_rank, not place.curated, KIND_RANK.get(place.kind, 6), len(place.name), place.name, place.id,
                )
                ranked.append((rank, place))
        return [place.result() for _, place in sorted(ranked)[:limit]]

    def nearby(self, lat, lng):
        row, column = cell(lat, lng)
        lng_scale = 111_195 * cos(radians(lat))
        nearest = None
        best = NEARBY_LIMIT_M ** 2
        for r in range(row - 1, row + 2):
            for c in range(column - 1, column + 2):
                for place in self.by_cell.get((r, c), ()):
                    distance = ((place.lat - lat) * 111_195) ** 2 + ((place.lng - lng) * lng_scale) ** 2
                    if distance < best:
                        best = distance
                        nearest = place
        return nearest


@lru_cache(maxsize=1)
def load_catalog():
    with gzip.open(CATALOG_PATH, "rt", encoding="utf-8") as stream:
        catalog = json.load(stream)
    with ALIASES_PATH.open(encoding="utf-8") as stream:
        overrides = json.load(stream)
    with CAMPUS_PLACES_PATH.open(encoding="utf-8") as stream:
        campus_places = json.load(stream)
    return PlaceCatalog(catalog, overrides, campus_places)
