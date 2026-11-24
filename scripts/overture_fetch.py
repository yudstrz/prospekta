import sys
import json
import overturemaps
import shapely

def fetch_bbox(min_lon, min_lat, max_lon, max_lat):
    try:
        reader = overturemaps.record_batch_reader(
            "place",
            bbox=(min_lon, min_lat, max_lon, max_lat),
            stac=True
        )
        if reader is None:
            return []

        places = []
        for batch in reader:
            pylist = batch.to_pylist()
            for row in pylist:
                names = row.get("names") or {}
                addresses = row.get("addresses") or []
                websites = row.get("websites") or []
                phones = row.get("phones") or []
                emails = row.get("emails") or []
                geom_bytes = row.get("geometry")

                lat, lng = None, None
                if geom_bytes:
                    try:
                        pt = shapely.from_wkb(geom_bytes)
                        lng, lat = float(pt.x), float(pt.y)
                    except Exception:
                        pass

                name = names.get("primary") if isinstance(names, dict) else None
                if not name:
                    continue

                # Multi-version category resolver
                cat_primary = None
                taxonomy = row.get("taxonomy")
                categories = row.get("categories")
                basic_cat = row.get("basic_category")

                if isinstance(taxonomy, dict) and taxonomy.get("primary"):
                    cat_primary = taxonomy.get("primary")
                elif isinstance(taxonomy, str):
                    cat_primary = taxonomy
                elif basic_cat:
                    cat_primary = basic_cat
                elif isinstance(categories, dict) and categories.get("primary"):
                    cat_primary = categories.get("primary")

                places.append({
                    "id": str(row.get("id")),
                    "name": name,
                    "category": cat_primary,
                    "confidence": float(row.get("confidence") or 0),
                    "address": addresses[0].get("freeform") if len(addresses) > 0 and isinstance(addresses[0], dict) else None,
                    "website": websites[0] if len(websites) > 0 else None,
                    "phone": phones[0] if len(phones) > 0 else None,
                    "email": emails[0] if len(emails) > 0 else None,
                    "lat": lat,
                    "lng": lng
                })
        return places
    except Exception as e:
        sys.stderr.write(f"Error fetching overture: {e}\n")
        return []

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(json.dumps([]))
        sys.exit(0)

    min_lon = float(sys.argv[1])
    min_lat = float(sys.argv[2])
    max_lon = float(sys.argv[3])
    max_lat = float(sys.argv[4])

    results = fetch_bbox(min_lon, min_lat, max_lon, max_lat)
    print(json.dumps(results))
