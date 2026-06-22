#!/usr/bin/env python3
"""
Build the Open Food Facts food-catalog seed dataset.

Strategy for reliability: nutrition comes from a CURATED table of standard
per-100g values (trustworthy + consistent), and Open Food Facts is used ONLY to
attach a verified, openly-licensed product photo (CC-BY-SA). Every image URL is
HEAD-checked for HTTP 200 before it's kept; foods whose image can't be verified
are still included with a null image (nutrition is the load-bearing data).

Output: services/meal-service/prisma/data/openfoodfacts-seed.json
Run:    python scripts/build-off-seed.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

OUT = os.path.join(
    os.path.dirname(__file__), "..",
    "services", "meal-service", "prisma", "data", "openfoodfacts-seed.json",
)
ATTRIB = "Photo: Open Food Facts contributors (CC-BY-SA 3.0)"
UA = {"User-Agent": "NightFuel-seed/1.0 (nutrition app catalog)"}

# name, category, foodGroup, search-term, kcal, protein, carbs, fat, fiber, sugar, sodiumMg, vegan, gf
FOODS = [
    # ── Fruits ───────────────────────────────────────────────────────────────
    ("Banana", "fruit", "Fruits", "banana", 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, True, True),
    ("Apple", "fruit", "Fruits", "apple", 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, True, True),
    ("Orange", "fruit", "Fruits", "orange", 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, True, True),
    ("Strawberries", "fruit", "Fruits", "strawberries", 32, 0.7, 7.7, 0.3, 2.0, 4.9, 1, True, True),
    ("Blueberries", "fruit", "Fruits", "blueberries", 57, 0.7, 14.5, 0.3, 2.4, 10.0, 1, True, True),
    ("Grapes", "fruit", "Fruits", "grapes", 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2, True, True),
    ("Watermelon", "fruit", "Fruits", "watermelon", 30, 0.6, 7.6, 0.2, 0.4, 6.2, 1, True, True),
    ("Mango", "fruit", "Fruits", "mango", 60, 0.8, 15.0, 0.4, 1.6, 13.7, 1, True, True),
    ("Pineapple", "fruit", "Fruits", "pineapple", 50, 0.5, 13.1, 0.1, 1.4, 9.9, 1, True, True),
    ("Avocado", "fruit", "Fruits", "avocado", 160, 2.0, 8.5, 14.7, 6.7, 0.7, 7, True, True),
    # ── Vegetables ───────────────────────────────────────────────────────────
    ("Spinach", "vegetable", "Vegetables", "spinach", 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, True, True),
    ("Broccoli", "vegetable", "Vegetables", "broccoli", 34, 2.8, 6.6, 0.4, 2.6, 1.7, 33, True, True),
    ("Carrot", "vegetable", "Vegetables", "carrots", 41, 0.9, 9.6, 0.2, 2.8, 4.7, 69, True, True),
    ("Tomato", "vegetable", "Vegetables", "tomatoes", 18, 0.9, 3.9, 0.2, 1.2, 2.6, 5, True, True),
    ("Potato", "vegetable", "Vegetables", "potatoes", 77, 2.0, 17.5, 0.1, 2.2, 0.8, 6, True, True),
    ("Sweet Potato", "vegetable", "Vegetables", "sweet potato", 86, 1.6, 20.1, 0.1, 3.0, 4.2, 55, True, True),
    ("Bell Pepper", "vegetable", "Vegetables", "bell pepper", 31, 1.0, 6.0, 0.3, 2.1, 4.2, 4, True, True),
    ("Cucumber", "vegetable", "Vegetables", "cucumber", 15, 0.7, 3.6, 0.1, 0.5, 1.7, 2, True, True),
    ("Onion", "vegetable", "Vegetables", "onion", 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, True, True),
    ("Kale", "vegetable", "Vegetables", "kale", 49, 4.3, 8.8, 0.9, 3.6, 2.3, 38, True, True),
    # ── Protein ──────────────────────────────────────────────────────────────
    ("Chicken Breast", "protein", "Protein", "chicken breast", 165, 31.0, 0.0, 3.6, 0.0, 0.0, 74, False, True),
    ("Salmon", "protein", "Protein", "salmon fillet", 208, 20.4, 0.0, 13.4, 0.0, 0.0, 59, False, True),
    ("Egg", "protein", "Protein", "eggs", 155, 13.0, 1.1, 11.0, 0.0, 1.1, 124, False, True),
    ("Canned Tuna", "protein", "Protein", "canned tuna", 116, 25.5, 0.0, 0.8, 0.0, 0.0, 247, False, True),
    ("Lean Beef", "protein", "Protein", "ground beef", 250, 26.0, 0.0, 15.0, 0.0, 0.0, 72, False, True),
    ("Turkey Breast", "protein", "Protein", "turkey breast", 135, 30.1, 0.0, 0.7, 0.0, 0.0, 1040, False, True),
    ("Shrimp", "protein", "Protein", "shrimp", 99, 24.0, 0.2, 0.3, 0.0, 0.0, 111, False, True),
    ("Tofu", "protein", "Protein", "tofu", 76, 8.0, 1.9, 4.8, 0.3, 0.6, 7, True, True),
    ("Tempeh", "protein", "Protein", "tempeh", 192, 20.3, 7.6, 10.8, 0.0, 0.0, 9, True, True),
    # ── Dairy ────────────────────────────────────────────────────────────────
    ("Greek Yogurt", "dairy", "Dairy", "greek yogurt", 59, 10.0, 3.6, 0.4, 0.0, 3.2, 36, False, True),
    ("Milk", "dairy", "Dairy", "milk", 61, 3.2, 4.8, 3.3, 0.0, 5.1, 43, False, True),
    ("Cheddar Cheese", "dairy", "Dairy", "cheddar cheese", 403, 24.9, 1.3, 33.1, 0.0, 0.5, 621, False, True),
    ("Cottage Cheese", "dairy", "Dairy", "cottage cheese", 98, 11.1, 3.4, 4.3, 0.0, 2.7, 364, False, True),
    ("Mozzarella", "dairy", "Dairy", "mozzarella", 280, 28.0, 3.1, 17.1, 0.0, 1.2, 627, False, True),
    # ── Grains ───────────────────────────────────────────────────────────────
    ("Oats", "grain", "Grains", "rolled oats", 389, 16.9, 66.3, 6.9, 10.6, 0.0, 2, True, False),
    ("Brown Rice", "grain", "Grains", "brown rice", 111, 2.6, 23.0, 0.9, 1.8, 0.4, 5, True, True),
    ("White Rice", "grain", "Grains", "white rice", 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, True, True),
    ("Quinoa", "grain", "Grains", "quinoa", 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, True, True),
    ("Whole Wheat Bread", "grain", "Grains", "whole wheat bread", 247, 13.0, 41.0, 3.4, 7.0, 6.0, 400, True, False),
    ("Pasta", "grain", "Grains", "pasta", 131, 5.0, 25.0, 1.1, 1.8, 0.6, 6, True, False),
    # ── Legumes ──────────────────────────────────────────────────────────────
    ("Lentils", "legume", "Legumes", "lentils", 116, 9.0, 20.1, 0.4, 7.9, 1.8, 2, True, True),
    ("Chickpeas", "legume", "Legumes", "chickpeas", 164, 8.9, 27.4, 2.6, 7.6, 4.8, 7, True, True),
    ("Black Beans", "legume", "Legumes", "black beans", 132, 8.9, 23.7, 0.5, 8.7, 0.3, 1, True, True),
    ("Kidney Beans", "legume", "Legumes", "kidney beans", 127, 8.7, 22.8, 0.5, 6.4, 0.3, 2, True, True),
    ("Edamame", "legume", "Legumes", "edamame", 121, 11.9, 8.9, 5.2, 5.2, 2.2, 6, True, True),
    # ── Nuts & seeds ─────────────────────────────────────────────────────────
    ("Almonds", "nut_seed", "Nuts & Seeds", "almonds", 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, True, True),
    ("Walnuts", "nut_seed", "Nuts & Seeds", "walnuts", 654, 15.2, 13.7, 65.2, 6.7, 2.6, 2, True, True),
    ("Chia Seeds", "nut_seed", "Nuts & Seeds", "chia seeds", 486, 16.5, 42.1, 30.7, 34.4, 0.0, 16, True, True),
    ("Peanut Butter", "nut_seed", "Nuts & Seeds", "peanut butter", 588, 25.1, 20.0, 50.4, 6.0, 9.2, 459, True, True),
    ("Cashews", "nut_seed", "Nuts & Seeds", "cashews", 553, 18.2, 30.2, 43.9, 3.3, 5.9, 12, True, True),
]


def fetch_image(term):
    """Return a verified-200 OFF image_front_url for the search term, or None."""
    url = ("https://world.openfoodfacts.org/api/v2/search?"
           + urllib.parse.urlencode({
               "fields": "image_front_url",
               "page_size": 8,
               "sort_by": "unique_scans_n",
               "search_terms": term,
           }))
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except Exception as e:
        print(f"  ! search failed for {term!r}: {e}")
        return None
    for p in data.get("products", []):
        img = p.get("image_front_url")
        if not img or not img.startswith("http"):
            continue
        # HEAD-check (GET with tiny range) for a real 200.
        try:
            hreq = urllib.request.Request(img, headers={**UA, "Range": "bytes=0-0"})
            with urllib.request.urlopen(hreq, timeout=20) as hr:
                if hr.status in (200, 206):
                    return img
        except Exception:
            continue
    return None


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out = []
    with_img = 0
    for (name, cat, group, term, kcal, prot, carb, fat, fib, sug, na, vegan, gf) in FOODS:
        img = fetch_image(term)
        if img:
            with_img += 1
        out.append({
            "name": name,
            "category": cat,
            "foodGroup": group,
            "calories": kcal, "protein": prot, "carbs": carb, "fat": fat,
            "fiber": fib, "sugar": sug, "sodiumMg": na,
            "servingSize": "100g",
            "isVegan": vegan, "isGlutenFree": gf, "isHalal": True,
            "imageUrl": img,
            "imageAttribution": ATTRIB if img else None,
            "source": "OPENFOODFACTS",
        })
        print(f"  {'IMG ' if img else 'noimg'} {name}")
        time.sleep(0.4)  # be polite to the OFF API
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {len(out)} foods ({with_img} with verified images) -> {OUT}")


if __name__ == "__main__":
    main()
