#!/usr/bin/env python3
"""Generate the fixed Spreewald POI dataset from the existing OSM XML extract."""

from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

BOUNDS = {"south": 51.5655066, "west": 13.7128759, "north": 52.1044933, "east": 14.5851240}
KEPT_TAGS = {
    "name", "opening_hours", "website", "contact:website", "phone", "contact:phone",
    "operator", "access", "fee", "description", "addr:street", "addr:housenumber",
    "addr:postcode", "addr:city", "waterway", "lock", "amenity", "tourism", "leisure", "canoe",
}


def classify(tags: dict[str, str]) -> str | None:
    if tags.get("waterway") in {"lock_gate", "lock"} or tags.get("lock") == "yes":
        return "lock"
    if tags.get("waterway") == "weir":
        return "weir"
    if tags.get("amenity") in {"restaurant", "cafe", "pub", "biergarten", "fast_food"}:
        return "restaurant"
    if tags.get("amenity") == "toilets":
        return "toilets"
    if tags.get("tourism") in {"camp_site", "caravan_site"}:
        return "camping"
    if (tags.get("leisure") == "slipway" or tags.get("canoe") in {"put_in", "launch"}
            or tags.get("waterway") == "access_point"):
        return "slipway"
    return None


def elements(path: Path):
    for _, element in ET.iterparse(path, events=("end",)):
        if element.tag in {"node", "way", "relation"}:
            yield element
            element.clear()


def tags_of(element: ET.Element) -> dict[str, str]:
    return {child.attrib["k"]: child.attrib.get("v", "") for child in element if child.tag == "tag"}


def average(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    if not points:
        return None
    return sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)


def main(input_path: Path, output_path: Path) -> None:
    matches: dict[tuple[str, int], dict] = {}
    relation_way_ids: set[int] = set()
    needed_node_ids: set[int] = set()

    for element in elements(input_path):
        osm_type, osm_id = element.tag, int(element.attrib["id"])
        tags = tags_of(element)
        category = classify(tags)
        if not category:
            continue
        record = {"osmType": osm_type, "osmId": osm_id, "type": category, "tags": tags}
        if osm_type == "node":
            record["point"] = (float(element.attrib["lat"]), float(element.attrib["lon"]))
        elif osm_type == "way":
            record["nodeRefs"] = [int(child.attrib["ref"]) for child in element if child.tag == "nd"]
            needed_node_ids.update(record["nodeRefs"])
        else:
            record["members"] = [(child.attrib["type"], int(child.attrib["ref"]))
                                 for child in element if child.tag == "member"]
            needed_node_ids.update(ref for member_type, ref in record["members"] if member_type == "node")
            relation_way_ids.update(ref for member_type, ref in record["members"] if member_type == "way")
        matches[(osm_type, osm_id)] = record

    relation_way_refs: dict[int, list[int]] = {}
    if relation_way_ids:
        for element in elements(input_path):
            if element.tag != "way":
                continue
            osm_id = int(element.attrib["id"])
            if osm_id in relation_way_ids:
                refs = [int(child.attrib["ref"]) for child in element if child.tag == "nd"]
                relation_way_refs[osm_id] = refs
                needed_node_ids.update(refs)

    node_locations: dict[int, tuple[float, float]] = {}
    for element in elements(input_path):
        if element.tag != "node":
            continue
        osm_id = int(element.attrib["id"])
        if osm_id in needed_node_ids:
            node_locations[osm_id] = (float(element.attrib["lat"]), float(element.attrib["lon"]))

    way_centers: dict[int, tuple[float, float]] = {}
    for way_id, refs in relation_way_refs.items():
        center = average([node_locations[ref] for ref in refs if ref in node_locations])
        if center:
            way_centers[way_id] = center

    pois: list[dict] = []
    seen_ids: set[str] = set()
    seen_positions: set[tuple[str, float, float]] = set()
    for record in matches.values():
        if record["osmType"] == "node":
            point = record["point"]
        elif record["osmType"] == "way":
            point = average([node_locations[ref] for ref in record["nodeRefs"] if ref in node_locations])
        else:
            member_points = []
            for member_type, ref in record["members"]:
                if member_type == "node" and ref in node_locations:
                    member_points.append(node_locations[ref])
                elif member_type == "way" and ref in way_centers:
                    member_points.append(way_centers[ref])
            point = average(member_points)
        if not point:
            continue
        lat, lon = point
        if not (BOUNDS["south"] <= lat <= BOUNDS["north"] and BOUNDS["west"] <= lon <= BOUNDS["east"]):
            continue
        identifier = f'{record["osmType"]}/{record["osmId"]}'
        position = (record["type"], round(lat, 7), round(lon, 7))
        if identifier in seen_ids or position in seen_positions:
            continue
        seen_ids.add(identifier)
        seen_positions.add(position)
        compact_tags = {key: value for key, value in record["tags"].items() if key in KEPT_TAGS and value}
        pois.append({
            "id": identifier,
            "type": record["type"],
            "lat": round(lat, 7),
            "lon": round(lon, 7),
            "name": compact_tags.get("name", ""),
            "tags": compact_tags,
        })

    pois.sort(key=lambda poi: (poi["type"], poi["name"], poi["id"]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(pois, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    counts = {category: sum(poi["type"] == category for poi in pois)
              for category in ("lock", "weir", "restaurant", "toilets", "camping", "slipway")}
    print(json.dumps({"total": len(pois), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="offline-test/work/spreewald-30km.osm")
    parser.add_argument("--output", default="offline-test/data/spreewald-pois.json")
    args = parser.parse_args()
    main(Path(args.input), Path(args.output))
