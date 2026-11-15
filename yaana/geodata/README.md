# Bengaluru place catalog

YAANA’s pickup and destination search uses [bengaluru_places.json.gz](bengaluru_places.json.gz). It includes named streets, neighbourhoods, bus stops, railway and metro stations, campuses, and other landmarks. The extract spans Bengaluru and the DSU commute area toward Harohalli, within latitude 12.63–13.24 and longitude 77.39–77.86.

Each entry stores its OpenStreetMap ID, name, alternate names when available, place type, coordinates, and locality when recorded. The file includes the upstream snapshot timestamp, coverage bounds, and counts by place type. Source data is from the [Geofabrik Southern Zone extract](https://download.geofabrik.de/asia/india/southern-zone.html). © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The catalog and its OSM-based local aliases are distributed under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

## Use in the app

`GET /geo/search?q=...` ranks exact names and aliases first and accepts partial words. This includes Kannada names where the OSM entry has one. The [local aliases](local_aliases.json) map common terms to existing OSM records. **DSU Main Campus** resolves to the mapped campus in Harohalli. **DSU City Innovation Campus, Kudlu Gate** uses a separate [campus record](campus_places.json) at Sagar IT Park, based on [DSU’s directions](https://www.dsu.edu.in/contact-us/maps-direction) and [campus geotags](https://www.dsu.edu.in/images/naac/Aqar_2023_24/Criterion4/4_3_1_Geotagged_Photos.pdf). It represents a point on campus. Search for **Kudlu Gate Metro** to select the station.

`GET /geo/reverse` can name a landmark within 120 metres of a pin while keeping the exact coordinates. It returns a coordinate label if no landmark is close. An area such as a university or park may be represented by its centre. Use a pin to specify a gate or entrance.

The catalog is reference data for geocoding. It has no passenger journeys or labels for training match predictions. Student matching continues to use actual published trips. OSRM separately computes driving geometry, distance, and estimated duration.

## Refresh the dataset

Download `southern-zone-latest.osm.pbf` from Geofabrik outside the repository. The Python package `osmium` is needed only to rebuild the snapshot.

```powershell
cd yaana
python -m pip install osmium
python -m geodata.build_bengaluru C:\path\to\southern-zone-latest.osm.pbf
python -m pytest geodata/tests -q
```

The importer validates the bounding box, drops private and explicitly under-construction places, consolidates nearby duplicates of the same name and type, and retains the upstream snapshot date. Review aliases against the new OpenStreetMap IDs and restart the API to load the updated catalog.
