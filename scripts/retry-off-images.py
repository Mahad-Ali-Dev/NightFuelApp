#!/usr/bin/env python3
"""Retry-fill OFF images for foods left without one (handles 503 rate-limits
with backoff + generous spacing). Idempotent: only touches null-image rows,
rewrites the same JSON. Run repeatedly until `missing` reaches 0 (or plateaus)."""
import json
import os
import time
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..",
                   "services", "meal-service", "prisma", "data", "openfoodfacts-seed.json")
ATTRIB = "Photo: Open Food Facts contributors (CC-BY-SA 3.0)"
UA = {"User-Agent": "NightFuel-seed/1.0 (nutrition app catalog)"}

# Search term per food name (mirrors the generator).
TERMS = {
    "Lentils": "lentils", "Chickpeas": "chickpeas", "Black Beans": "black beans",
    "Almonds": "almonds", "Chia Seeds": "chia seeds", "Peanut Butter": "peanut butter",
    "Cashews": "cashews", "Spinach": "spinach", "Kale": "kale", "Onion": "onion",
    "Cucumber": "cucumber", "Tofu": "tofu", "Tempeh": "tempeh", "Quinoa": "quinoa",
    "Cottage Cheese": "cottage cheese", "Turkey Breast": "turkey breast",
    "Shrimp": "shrimp", "Sweet Potato": "sweet potato", "Bell Pepper": "bell pepper",
}


def fetch_image(term, retries=4):
    url = ("https://world.openfoodfacts.org/api/v2/search?"
           + urllib.parse.urlencode({"fields": "image_front_url", "page_size": 8,
                                     "sort_by": "unique_scans_n", "search_terms": term}))
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.load(r)
            for p in data.get("products", []):
                img = p.get("image_front_url")
                if img and img.startswith("http"):
                    try:
                        hreq = urllib.request.Request(img, headers={**UA, "Range": "bytes=0-0"})
                        with urllib.request.urlopen(hreq, timeout=25) as hr:
                            if hr.status in (200, 206):
                                return img
                    except Exception:
                        continue
            return None
        except urllib.error.HTTPError as e:
            if e.code == 503:
                wait = 3 * (attempt + 1)
                print(f"    503 for {term!r}, backoff {wait}s")
                time.sleep(wait)
                continue
            return None
        except Exception as e:
            print(f"    err {term!r}: {e}")
            return None
    return None


def main():
    with open(OUT, encoding="utf-8") as f:
        data = json.load(f)
    missing = [x for x in data if not x.get("imageUrl")]
    print(f"{len(missing)} foods missing an image")
    filled = 0
    for food in missing:
        term = TERMS.get(food["name"], food["name"].lower())
        img = fetch_image(term)
        if img:
            food["imageUrl"] = img
            food["imageAttribution"] = ATTRIB
            filled += 1
            print(f"  IMG  {food['name']}")
        else:
            print(f"  ---  {food['name']}")
        time.sleep(2.0)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total_img = sum(1 for x in data if x.get("imageUrl"))
    print(f"\nfilled {filled} this pass; {total_img}/{len(data)} now have images")


if __name__ == "__main__":
    main()
