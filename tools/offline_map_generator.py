#!/usr/bin/env python3
"""Validation and artifact helpers for the dynamic offline-map workflow."""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
from datetime import datetime, timezone
from pathlib import Path

RADIUS_KM = 30.0
MIN_ZOOM = 10
MAX_ZOOM = 15
EARTH_RADIUS_KM = 6371.0088
BRANDENBURG_BERLIN = {"south": 51.30, "west": 11.20, "north": 53.60, "east": 15.00}
KEPT_TAGS = {
    "name", "opening_hours", "website", "contact:website", "phone", "contact:phone",
    "operator", "description", "access", "fee", "addr:street", "addr:housenumber",
    "addr:postcode", "addr:city", "waterway", "lock", "amenity", "tourism", "leisure", "canoe",
}
CATEGORIES = ("locks", "weirs", "restaurants", "toilets", "camping", "slipways")


def numeric(value: str, label: str, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise SystemExit(f"Fehler: {label} muss eine gültige Zahl sein: {value!r}") from error
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise SystemExit(f"Fehler: {label} muss zwischen {minimum:g} und {maximum:g} liegen.")
    return number


def calculate_bounds(latitude: float, longitude: float) -> dict[str, float]:
    angular = RADIUS_KM / EARTH_RADIUS_KM
    lat_rad = math.radians(latitude)
    lat_delta = math.degrees(angular)
    lon_delta = math.degrees(math.asin(math.sin(angular) / math.cos(lat_rad)))
    return {
        "south": latitude - lat_delta,
        "west": longitude - lon_delta,
        "north": latitude + lat_delta,
        "east": longitude + lon_delta,
    }


def prepare(args: argparse.Namespace) -> None:
    latitude = numeric(args.latitude, "Latitude", -90, 90)
    longitude = numeric(args.longitude, "Longitude", -180, 180)
    region = BRANDENBURG_BERLIN
    if not (region["south"] <= latitude <= region["north"] and region["west"] <= longitude <= region["east"]):
        raise SystemExit("Aktuell unterstützt der Offline-Generator nur Brandenburg/Berlin.")
    map_name = args.map_name.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", map_name):
        raise SystemExit("Fehler: map_name darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.")
    bounds = calculate_bounds(latitude, longitude)
    context = {
        "mapName": map_name,
        "center": {"lat": latitude, "lon": longitude},
        "radiusKm": int(RADIUS_KM),
        "minZoom": MIN_ZOOM,
        "maxZoom": MAX_ZOOM,
        "bounds": bounds,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(context, indent=2) + "\n", encoding="utf-8")
    bbox = f'{bounds["west"]:.7f},{bounds["south"]:.7f},{bounds["east"]:.7f},{bounds["north"]:.7f}'
    print(f"Mittelpunkt: {latitude:.7f}, {longitude:.7f}")
    print(f"Radius: {RADIUS_KM:g} km")
    print(f"Bounding Box (W,S,E,N): {bbox}")
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as handle:
            handle.write(f"bounds_csv={bbox}\n")
            handle.write(f"latitude={latitude:.7f}\nlongitude={longitude:.7f}\n")


def geometry_points(geometry: dict | None) -> list[tuple[float, float]]:
    if not geometry:
        return []
    coordinates = geometry.get("coordinates")
    points: list[tuple[float, float]] = []

    def visit(value: object) -> None:
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            points.append((float(value[0]), float(value[1])))
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(coordinates)
    return points


def classify(tags: dict[str, str]) -> str | None:
    if tags.get("waterway") in {"lock_gate", "lock"} or tags.get("lock") == "yes":
        return "locks"
    if tags.get("waterway") == "weir":
        return "weirs"
    if tags.get("amenity") in {"restaurant", "cafe", "pub", "biergarten", "fast_food"}:
        return "restaurants"
    if tags.get("amenity") == "toilets":
        return "toilets"
    if tags.get("tourism") in {"camp_site", "caravan_site"}:
        return "camping"
    if (tags.get("leisure") == "slipway" or tags.get("canoe") in {"put_in", "launch"}
            or tags.get("waterway") == "access_point"):
        return "slipways"
    return None


def make_pois(args: argparse.Namespace) -> None:
    context = json.loads(Path(args.context).read_text(encoding="utf-8"))
    source = json.loads(Path(args.geojson).read_text(encoding="utf-8"))
    bounds = context["bounds"]
    pois: list[dict] = []
    seen: set[tuple] = set()
    for feature in source.get("features", []):
        tags = {str(key): str(value) for key, value in (feature.get("properties") or {}).items() if not key.startswith("@")}
        category = classify(tags)
        points = geometry_points(feature.get("geometry"))
        if not category or not points:
            continue
        lon = sum(point[0] for point in points) / len(points)
        lat = sum(point[1] for point in points) / len(points)
        if not (bounds["south"] <= lat <= bounds["north"] and bounds["west"] <= lon <= bounds["east"]):
            continue
        osm_id = (feature.get("properties") or {}).get("@id", feature.get("id", ""))
        dedupe = (category, str(osm_id), round(lat, 7), round(lon, 7))
        if dedupe in seen:
            continue
        seen.add(dedupe)
        compact_tags = {key: value for key, value in tags.items() if key in KEPT_TAGS and value}
        pois.append({
            "type": category,
            "lat": round(lat, 7),
            "lon": round(lon, 7),
            **({"name": compact_tags["name"]} if compact_tags.get("name") else {}),
            "tags": compact_tags,
        })
    pois.sort(key=lambda poi: (poi["type"], poi.get("name", ""), poi["lat"], poi["lon"]))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(pois, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"POIs erzeugt: {len(pois)}")


def read_pmtiles_header(path: Path) -> dict[str, int]:
    size = path.stat().st_size
    if size < 127:
        raise SystemExit("Fehler: PMTiles-Datei ist leer oder zu klein.")
    with path.open("rb") as handle:
        header = handle.read(127)
    if header[:7] != b"PMTiles" or header[7] != 3:
        raise SystemExit("Fehler: PMTiles-v3-Header ist ungültig.")
    addressed_tiles = struct.unpack_from("<Q", header, 72)[0]
    min_zoom, max_zoom = header[100], header[101]
    if min_zoom != MIN_ZOOM or max_zoom != MAX_ZOOM:
        raise SystemExit(f"Fehler: PMTiles-Zoom ist {min_zoom}-{max_zoom}, erwartet {MIN_ZOOM}-{MAX_ZOOM}.")
    if addressed_tiles <= 0:
        raise SystemExit("Fehler: PMTiles enthält keine adressierten Tiles.")
    return {"bytes": size, "version": 3, "minZoom": min_zoom, "maxZoom": max_zoom, "tiles": addressed_tiles}


def finalize(args: argparse.Namespace) -> None:
    context = json.loads(Path(args.context).read_text(encoding="utf-8"))
    pois = json.loads(Path(args.pois).read_text(encoding="utf-8"))
    if not isinstance(pois, list):
        raise SystemExit("Fehler: offline-pois.json muss ein JSON-Array sein.")
    header = read_pmtiles_header(Path(args.pmtiles))
    counts = {category: sum(poi.get("type") == category for poi in pois) for category in CATEGORIES}
    metadata = {
        **context,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pmtilesFile": "offline-map.pmtiles",
        "poiFile": "offline-pois.json",
        "pmtilesBytes": header["bytes"],
        "poiCount": len(pois),
        "poiCounts": counts,
        "pmtiles": {"version": header["version"], "addressedTiles": header["tiles"]},
    }
    Path(args.metadata).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bounds = context["bounds"]
    size_mib = header["bytes"] / 1024 / 1024
    summary = f"""# Offline-Karte erfolgreich erzeugt

- **Mittelpunkt:** {context['center']['lat']:.7f} / {context['center']['lon']:.7f}
- **Radius:** {context['radiusKm']} km
- **Bounding Box (S/W/N/E):** {bounds['south']:.7f} / {bounds['west']:.7f} / {bounds['north']:.7f} / {bounds['east']:.7f}
- **PMTiles:** {size_mib:.2f} MiB, v3, {header['tiles']} adressierte Tiles
- **Zoom:** {header['minZoom']}-{header['maxZoom']}

## POIs

- Schleusen: {counts['locks']}
- Wehre: {counts['weirs']}
- Gaststätten: {counts['restaurants']}
- Toiletten: {counts['toilets']}
- Camping: {counts['camping']}
- Slipways/Einstiege: {counts['slipways']}

**Artifact:** `{args.artifact_name}`
"""
    Path(args.summary).write_text(summary, encoding="utf-8")
    print(f"PMTiles geprüft: v3, Zoom {MIN_ZOOM}-{MAX_ZOOM}, {header['bytes']} Bytes, {header['tiles']} Tiles")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare")
    prep.add_argument("--latitude", required=True)
    prep.add_argument("--longitude", required=True)
    prep.add_argument("--map-name", default="offline-map")
    prep.add_argument("--output", required=True)
    prep.add_argument("--github-output")
    prep.set_defaults(func=prepare)
    poi = commands.add_parser("pois")
    poi.add_argument("--context", required=True)
    poi.add_argument("--geojson", required=True)
    poi.add_argument("--output", required=True)
    poi.set_defaults(func=make_pois)
    final = commands.add_parser("finalize")
    final.add_argument("--context", required=True)
    final.add_argument("--pmtiles", required=True)
    final.add_argument("--pois", required=True)
    final.add_argument("--metadata", required=True)
    final.add_argument("--summary", required=True)
    final.add_argument("--artifact-name", required=True)
    final.set_defaults(func=finalize)
    return root


if __name__ == "__main__":
    arguments = parser().parse_args()
    arguments.func(arguments)
