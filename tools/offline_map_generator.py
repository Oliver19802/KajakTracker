#!/usr/bin/env python3
"""Worldwide source selection, validation and artifact helpers for offline maps."""

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
WEB_MERCATOR_LIMIT = 85.05112878
PROTOMAPS_BUILD_BASE = "https://build.protomaps.com/"
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


def normalize_longitude(value: float) -> float:
    normalized = (value + 180.0) % 360.0 - 180.0
    return 180.0 if normalized == -180.0 and value > 0 else normalized


def calculate_bounds(latitude: float, longitude: float) -> tuple[dict[str, float], list[list[float]]]:
    angular = RADIUS_KM / EARTH_RADIUS_KM
    lat_delta = math.degrees(angular)
    south, north = latitude - lat_delta, latitude + lat_delta
    if south < -WEB_MERCATOR_LIMIT or north > WEB_MERCATOR_LIMIT:
        raise SystemExit(
            f"Fehler: Der vollständige 30-km-Bereich liegt außerhalb der Web-Mercator-Grenzen "
            f"±{WEB_MERCATOR_LIMIT:.8f}."
        )
    lon_delta = math.degrees(math.asin(math.sin(angular) / math.cos(math.radians(latitude))))
    raw_west, raw_east = longitude - lon_delta, longitude + lon_delta
    west, east = normalize_longitude(raw_west), normalize_longitude(raw_east)
    if raw_west < -180.0:
        parts = [[west, south, 180.0, north], [-180.0, south, east, north]]
    elif raw_east > 180.0:
        parts = [[west, south, 180.0, north], [-180.0, south, east, north]]
    else:
        parts = [[west, south, east, north]]
    return {"south": south, "west": west, "north": north, "east": east}, parts


def prepare(args: argparse.Namespace) -> None:
    latitude = numeric(args.latitude, "Latitude", -85, 85)
    longitude = numeric(args.longitude, "Longitude", -180, 180)
    map_name = args.map_name.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", map_name):
        raise SystemExit("Fehler: map_name darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.")
    bounds, bbox_parts = calculate_bounds(latitude, longitude)
    context = {
        "mapName": map_name,
        "center": {"lat": latitude, "lon": longitude},
        "radiusKm": int(RADIUS_KM),
        "minZoom": MIN_ZOOM,
        "maxZoom": MAX_ZOOM,
        "bounds": bounds,
        "bboxParts": bbox_parts,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(context, indent=2) + "\n", encoding="utf-8")
    bbox = ",".join(f"{value:.7f}" for value in bbox_parts[0])
    print(f"Mittelpunkt: {latitude:.7f}, {longitude:.7f}")
    print(f"Radius: {RADIUS_KM:g} km")
    print(f"Bounding Box parts (W,S,E,N): {bbox_parts}")
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as handle:
            handle.write(f"bounds_csv={bbox}\n")
            handle.write(f"latitude={latitude:.7f}\nlongitude={longitude:.7f}\n")


def rings(geometry: dict | None) -> list[list[list[float]]]:
    if not geometry:
        return []
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        return coordinates
    if geometry.get("type") == "MultiPolygon":
        return [ring for polygon in coordinates for ring in polygon]
    return []


def point_on_segment(x: float, y: float, a: list[float], b: list[float]) -> bool:
    cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
    return abs(cross) < 1e-10 and min(a[0], b[0]) - 1e-10 <= x <= max(a[0], b[0]) + 1e-10 and min(
        a[1], b[1]
    ) - 1e-10 <= y <= max(a[1], b[1]) + 1e-10


def point_in_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for index, first in enumerate(ring):
        second = ring[(index + 1) % len(ring)]
        if point_on_segment(x, y, first, second):
            return True
        if (first[1] > y) != (second[1] > y):
            crossing_x = (second[0] - first[0]) * (y - first[1]) / (second[1] - first[1]) + first[0]
            if x < crossing_x:
                inside = not inside
    return inside


def geometry_contains(geometry: dict | None, point: tuple[float, float]) -> bool:
    if not geometry:
        return False
    polygons = [geometry.get("coordinates", [])] if geometry.get("type") == "Polygon" else geometry.get("coordinates", [])
    for polygon in polygons:
        if polygon and point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:]):
            return True
    return False


def bbox_samples(parts: list[list[float]]) -> list[tuple[float, float]]:
    samples: list[tuple[float, float]] = []
    for west, south, east, north in parts:
        for x_index in range(5):
            for y_index in range(5):
                samples.append((west + (east - west) * x_index / 4, south + (north - south) * y_index / 4))
    return samples


def select_geofabrik_regions(index: dict, bbox_parts: list[list[float]]) -> list[dict]:
    features = [feature for feature in index.get("features", []) if feature.get("properties", {}).get("urls", {}).get("pbf")]
    by_id = {feature["properties"]["id"]: feature for feature in features}

    def depth(feature: dict) -> int:
        result, current, seen = 0, feature, set()
        while current.get("properties", {}).get("parent") in by_id:
            parent = current["properties"]["parent"]
            if parent in seen:
                break
            seen.add(parent)
            result += 1
            current = by_id[parent]
        return result

    chosen: dict[str, dict] = {}
    uncovered: list[tuple[float, float]] = []
    for point in bbox_samples(bbox_parts):
        candidates = [feature for feature in features if geometry_contains(feature.get("geometry"), point)]
        if not candidates:
            uncovered.append(point)
            continue
        selected = max(candidates, key=lambda feature: (depth(feature), -len(json.dumps(feature.get("geometry", {})))))
        chosen[selected["properties"]["id"]] = selected
    if uncovered:
        preview = ", ".join(f"{lon:.3f}/{lat:.3f}" for lon, lat in uncovered[:3])
        raise SystemExit(
            "Fehler: Geofabrik deckt den vollständigen 30-km-Bereich nicht mit praktikablen regionalen "
            f"Extrakten ab (unabgedeckte Prüfpunkte: {preview})."
        )
    return sorted(chosen.values(), key=lambda feature: feature["properties"]["id"])


def resolve_sources(args: argparse.Namespace) -> None:
    context = json.loads(Path(args.context).read_text(encoding="utf-8"))
    if args.protomaps_url.strip():
        protomaps_url, build_key = args.protomaps_url.strip(), "configured"
    else:
        builds = json.loads(Path(args.protomaps_builds).read_text(encoding="utf-8"))
        valid = [build for build in builds if str(build.get("key", "")).endswith(".pmtiles")]
        if not valid:
            raise SystemExit("Fehler: Die Protomaps-Buildliste enthält keinen PMTiles-Build.")
        latest = max(valid, key=lambda build: str(build["key"]))
        build_key = str(latest["key"])
        protomaps_url = PROTOMAPS_BUILD_BASE + build_key
    geofabrik_index = json.loads(Path(args.geofabrik_index).read_text(encoding="utf-8"))
    regions = select_geofabrik_regions(geofabrik_index, context["bboxParts"])
    selected = [{
        "id": region["properties"]["id"],
        "name": region["properties"].get("name", region["properties"]["id"]),
        "url": region["properties"]["urls"]["pbf"],
    } for region in regions]
    source_context = {
        "basemapSource": "Protomaps / OpenStreetMap",
        "protomapsBuild": build_key,
        "protomapsUrl": protomaps_url,
        "poiSource": "OpenStreetMap / Geofabrik",
        "geofabrikRegions": [region["id"] for region in selected],
        "geofabrikRegionDetails": selected,
        "attribution": "© OpenStreetMap contributors · Protomaps",
    }
    Path(args.output).write_text(json.dumps(source_context, indent=2) + "\n", encoding="utf-8")
    Path(args.regions_tsv).write_text("".join(f'{region["id"]}\t{region["url"]}\n' for region in selected), encoding="utf-8")
    print(f"Protomaps build: {build_key}")
    print("Geofabrik regions: " + ", ".join(region["id"] for region in selected))
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as handle:
            handle.write(f"protomaps_url={protomaps_url}\n")
            handle.write(f"protomaps_build={build_key}\n")


def geometry_points(geometry: dict | None) -> list[tuple[float, float]]:
    if not geometry:
        return []
    points: list[tuple[float, float]] = []

    def visit(value: object) -> None:
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            points.append((float(value[0]), float(value[1])))
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(geometry.get("coordinates"))
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
    if tags.get("leisure") == "slipway" or tags.get("canoe") in {"put_in", "launch"} or tags.get("waterway") == "access_point":
        return "slipways"
    return None


def make_pois(args: argparse.Namespace) -> None:
    context = json.loads(Path(args.context).read_text(encoding="utf-8"))
    source = json.loads(Path(args.geojson).read_text(encoding="utf-8"))
    parts = context["bboxParts"]
    pois, seen = [], set()
    for feature in source.get("features", []):
        properties = feature.get("properties") or {}
        tags = {str(key): str(value) for key, value in properties.items() if not key.startswith("@")}
        category, points = classify(tags), geometry_points(feature.get("geometry"))
        if not category or not points:
            continue
        lon = sum(point[0] for point in points) / len(points)
        lat = sum(point[1] for point in points) / len(points)
        if not any(west <= lon <= east and south <= lat <= north for west, south, east, north in parts):
            continue
        osm_id = properties.get("@id", feature.get("id", ""))
        dedupe = (category, str(osm_id), round(lat, 7), round(lon, 7))
        if dedupe in seen:
            continue
        seen.add(dedupe)
        compact_tags = {key: value for key, value in tags.items() if key in KEPT_TAGS and value}
        pois.append({"type": category, "lat": round(lat, 7), "lon": round(lon, 7),
                     **({"name": compact_tags["name"]} if compact_tags.get("name") else {}), "tags": compact_tags})
    pois.sort(key=lambda poi: (poi["type"], poi.get("name", ""), poi["lat"], poi["lon"]))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(pois, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"POIs erzeugt: {len(pois)}")


def read_pmtiles_header(path: Path) -> dict[str, int]:
    size = path.stat().st_size
    if size < 127:
        raise SystemExit("Fehler: PMTiles-Datei ist leer oder zu klein.")
    header = path.read_bytes()[:127]
    if header[:7] != b"PMTiles" or header[7] != 3:
        raise SystemExit("Fehler: PMTiles-v3-Header ist ungültig.")
    addressed_tiles = struct.unpack_from("<Q", header, 72)[0]
    min_zoom, max_zoom = header[100], header[101]
    if min_zoom != MIN_ZOOM or max_zoom != MAX_ZOOM:
        raise SystemExit(f"Fehler: PMTiles-Zoom ist {min_zoom}-{max_zoom}, erwartet {MIN_ZOOM}-{MAX_ZOOM}.")
    if addressed_tiles <= 0:
        raise SystemExit("Fehler: PMTiles enthält keine adressierten Tiles.")
    return {"bytes": size, "version": 3, "minZoom": min_zoom, "maxZoom": max_zoom, "tiles": addressed_tiles}


def metric(path: Path, default: int = 0) -> int:
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return default


def transferred_bytes(log_path: Path) -> int:
    try:
        log = log_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return 0
    matches = re.findall(r"Extract transferred\s+([0-9.]+)\s*(B|KB|MB|GB|TB)", log, re.IGNORECASE)
    factors = {"B": 1, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4}
    return sum(round(float(value) * factors[unit.upper()]) for value, unit in matches)


def finalize(args: argparse.Namespace) -> None:
    context = json.loads(Path(args.context).read_text(encoding="utf-8"))
    sources = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    pois = json.loads(Path(args.pois).read_text(encoding="utf-8"))
    if not isinstance(pois, list):
        raise SystemExit("Fehler: offline-pois.json muss ein JSON-Array sein.")
    header = read_pmtiles_header(Path(args.pmtiles))
    counts = {category: sum(poi.get("type") == category for poi in pois) for category in CATEGORIES}
    metrics_dir = Path(args.metrics_dir)
    metrics = {
        "pmtilesExtractSeconds": metric(metrics_dir / "pmtiles-seconds.txt"),
        "pmtilesTransferredBytes": transferred_bytes(metrics_dir / "pmtiles-extract.log"),
        "geofabrikDownloadedBytes": metric(metrics_dir / "geofabrik-bytes.txt"),
    }
    metadata = {**context, **sources, "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "pmtilesFile": "offline-map.pmtiles", "poiFile": "offline-pois.json", "pmtilesBytes": header["bytes"],
                "poiCount": len(pois), "poiCounts": counts, "pmtiles": {"version": 3, "addressedTiles": header["tiles"]},
                "metrics": metrics}
    Path(args.metadata).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bounds, size_mib = context["bounds"], header["bytes"] / 1024 / 1024
    source_mib = metrics["geofabrikDownloadedBytes"] / 1024 / 1024
    summary = f"""# Offline-Karte erfolgreich erzeugt

- **Mittelpunkt:** {context['center']['lat']:.7f} / {context['center']['lon']:.7f}
- **Radius:** {context['radiusKm']} km
- **Bounding Box (S/W/N/E):** {bounds['south']:.7f} / {bounds['west']:.7f} / {bounds['north']:.7f} / {bounds['east']:.7f}
- **PMTiles:** {size_mib:.2f} MiB, v3, {header['tiles']} adressierte Tiles, Zoom {MIN_ZOOM}-{MAX_ZOOM}
- **Protomaps Build:** `{sources['protomapsBuild']}`
- **Geofabrik:** {', '.join(sources['geofabrikRegions'])}
- **Geofabrik Download:** {source_mib:.2f} MiB
- **PMTiles Extract:** {metrics['pmtilesExtractSeconds']} s

## POIs

- Schleusen: {counts['locks']}
- Wehre: {counts['weirs']}
- Gaststätten: {counts['restaurants']}
- Toiletten: {counts['toilets']}
- Camping/Caravan: {counts['camping']}
- Slipways/Einstiege: {counts['slipways']}

**Attribution:** © OpenStreetMap contributors · Protomaps

**Artifact:** `{args.artifact_name}`
"""
    Path(args.summary).write_text(summary, encoding="utf-8")
    print(f"PMTiles geprüft: v3, Zoom {MIN_ZOOM}-{MAX_ZOOM}, {header['bytes']} Bytes, {header['tiles']} Tiles")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare")
    prep.add_argument("--latitude", required=True); prep.add_argument("--longitude", required=True)
    prep.add_argument("--map-name", default="offline-map"); prep.add_argument("--output", required=True)
    prep.add_argument("--github-output"); prep.set_defaults(func=prepare)
    source = commands.add_parser("sources")
    source.add_argument("--context", required=True); source.add_argument("--protomaps-builds", required=True)
    source.add_argument("--protomaps-url", default=""); source.add_argument("--geofabrik-index", required=True)
    source.add_argument("--regions-tsv", required=True); source.add_argument("--output", required=True)
    source.add_argument("--github-output"); source.set_defaults(func=resolve_sources)
    poi = commands.add_parser("pois")
    poi.add_argument("--context", required=True); poi.add_argument("--geojson", required=True)
    poi.add_argument("--output", required=True); poi.set_defaults(func=make_pois)
    final = commands.add_parser("finalize")
    final.add_argument("--context", required=True); final.add_argument("--sources", required=True)
    final.add_argument("--metrics-dir", required=True); final.add_argument("--pmtiles", required=True)
    final.add_argument("--pois", required=True); final.add_argument("--metadata", required=True)
    final.add_argument("--summary", required=True); final.add_argument("--artifact-name", required=True)
    final.set_defaults(func=finalize)
    return root


if __name__ == "__main__":
    arguments = parser().parse_args()
    arguments.func(arguments)
