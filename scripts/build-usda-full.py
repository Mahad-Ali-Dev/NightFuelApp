#!/usr/bin/env python3
"""
Full USDA SR Legacy ingestion → the complete generic-food catalog (~7,000+ foods)
with macros + micronutrients, organized by USDA's own food categories, with
best-effort dietary flags. Merges in the verified Open Food Facts images already
collected for the common-foods subset (matched by name).

Run AFTER the image-fetch pass so the curated images survive the rebuild.
Run:  python scripts/build-usda-full.py
Out:  services/meal-service/prisma/data/openfoodfacts-seed.json  (overwrites)
"""
import io
import json
import os
import re
import urllib.request
import zipfile

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "services", "meal-service", "prisma", "data", "openfoodfacts-seed.json")
SR_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"

NUTRIENT_MAP = {
    "Energy": "calories", "Protein": "protein", "Carbohydrate, by difference": "carbs",
    "Total lipid (fat)": "fat", "Fiber, total dietary": "fiber",
    "Sugars, total including NLEA": "sugar", "Sodium, Na": "sodiumMg",
    "Iron, Fe": "ironMg", "Magnesium, Mg": "magnesiumMg", "Calcium, Ca": "calciumMg",
    "Potassium, K": "potassiumMg", "Zinc, Zn": "zincMg",
    "Vitamin C, total ascorbic acid": "vitaminCMg", "Vitamin B-6": "vitaminB6Mg",
    "Vitamin B-12": "vitaminB12Mcg", "Folate, total": "folateMcg",
    "Vitamin D (D2 + D3)": "vitaminDMcg",
}

# USDA foodCategory -> (our category, foodGroup)
CAT_MAP = {
    "fruits and fruit juices": ("fruit", "Fruits"),
    "vegetables and vegetable products": ("vegetable", "Vegetables"),
    "legumes and legume products": ("legume", "Legumes"),
    "nut and seed products": ("nut_seed", "Nuts & Seeds"),
    "cereal grains and pasta": ("grain", "Grains"),
    "breakfast cereals": ("grain", "Grains"),
    "baked products": ("grain", "Baked Goods"),
    "dairy and egg products": ("dairy", "Dairy & Eggs"),
    "beef products": ("protein", "Meat"),
    "pork products": ("protein", "Meat"),
    "poultry products": ("protein", "Poultry"),
    "lamb, veal, and game products": ("protein", "Meat"),
    "sausages and luncheon meats": ("protein", "Meat"),
    "finfish and shellfish products": ("protein", "Seafood"),
    "fats and oils": ("other", "Fats & Oils"),
    "beverages": ("beverage", "Beverages"),
    "soups, sauces, and gravies": ("other", "Soups & Sauces"),
    "spices and herbs": ("other", "Spices & Herbs"),
    "sweets": ("other", "Sweets"),
    "snacks": ("other", "Snacks"),
}

NON_VEGAN = re.compile(r"\b(beef|pork|chicken|turkey|lamb|veal|fish|salmon|tuna|cod|shrimp|crab|egg|eggs|milk|cheese|butter|yogurt|cream|honey|gelatin|bacon|ham|sausage|meat|poultry|whey|casein)\b", re.I)
NON_VEGETARIAN = re.compile(r"\b(beef|pork|chicken|turkey|lamb|veal|fish|salmon|tuna|cod|shrimp|crab|bacon|ham|sausage|meat|poultry|gelatin)\b", re.I)
GLUTEN = re.compile(r"\b(wheat|barley|rye|bread|pasta|cereal|flour|cracker|couscous|bulgur|malt|seitan|noodle|biscuit|cake|pastry)\b", re.I)
NON_HALAL = re.compile(r"\b(pork|bacon|ham|lard|wine|beer|alcohol|rum|liquor|gelatin)\b", re.I)


def download_sr():
    print("downloading SR Legacy ...")
    req = urllib.request.Request(SR_URL, headers={"User-Agent": "NightFuel-seed/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        blob = r.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = [n for n in z.namelist() if n.endswith(".json")][0]
        with z.open(name) as f:
            data = json.load(f)
    foods = data.get("SRLegacyFoods", [])
    print(f"  loaded {len(foods)} SR Legacy foods")
    return foods


def load_existing_curated():
    """The curated common-foods list (clean names + verified OFF images +
    source OPENFOODFACTS). Kept AS-IS and prepended to the full USDA dump — the
    two have different `source` values so the seeder upserts them as distinct
    rows. This guarantees the verified images survive (USDA descriptions like
    'Bananas, raw' would never name-match the curated 'Banana')."""
    if not os.path.exists(OUT):
        return []
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def title_case_food(desc):
    # "Bananas, raw" -> "Bananas, raw" (keep USDA description; trim length)
    return desc.strip()[:120]


def extract(food):
    out = {}
    for fn in food.get("foodNutrients", []):
        nut = fn.get("nutrient", {})
        name = nut.get("name", "")
        if name not in NUTRIENT_MAP:
            continue
        amt = fn.get("amount")
        if amt is None:
            continue
        field = NUTRIENT_MAP[name]
        if field == "calories" and (nut.get("unitName", "").upper() != "KCAL"):
            continue
        out[field] = round(float(amt), 2)
    return out


def main():
    curated = load_existing_curated()
    curated_imgs = sum(1 for x in curated if x.get("imageUrl"))
    print(f"  keeping {len(curated)} curated foods ({curated_imgs} imaged) up front")
    images = {}  # full USDA dump carries no OFF images (can't rate-limit 7k fetches)
    sr = download_sr()
    out, kept, skipped = [], 0, 0
    for food in sr:
        desc = food.get("description", "")
        if not desc:
            skipped += 1
            continue
        cat_desc = (food.get("foodCategory") or {}).get("description", "").lower()
        category, group = CAT_MAP.get(cat_desc, ("other", food.get("foodCategory", {}).get("description") or "Other"))
        n = extract(food)
        if "calories" not in n or "protein" not in n:
            skipped += 1
            continue
        name = title_case_food(desc)
        low = (name + " " + cat_desc).lower()
        is_vegan = not NON_VEGAN.search(low) and category not in ("protein", "dairy")
        img, attrib = images.get(name.lower(), (None, None))
        out.append({
            "name": name, "category": category, "foodGroup": group,
            "calories": n.get("calories", 0), "protein": n.get("protein", 0),
            "carbs": n.get("carbs", 0), "fat": n.get("fat", 0),
            "fiber": n.get("fiber", 0), "sugar": n.get("sugar", 0), "sodiumMg": n.get("sodiumMg", 0),
            "ironMg": n.get("ironMg"), "magnesiumMg": n.get("magnesiumMg"),
            "calciumMg": n.get("calciumMg"), "potassiumMg": n.get("potassiumMg"),
            "zincMg": n.get("zincMg"), "vitaminCMg": n.get("vitaminCMg"),
            "vitaminB6Mg": n.get("vitaminB6Mg"), "vitaminB12Mcg": n.get("vitaminB12Mcg"),
            "folateMcg": n.get("folateMcg"), "vitaminDMcg": n.get("vitaminDMcg"),
            "servingSize": "100g",
            "isVegan": bool(is_vegan), "isGlutenFree": not bool(GLUTEN.search(low)),
            "isHalal": not bool(NON_HALAL.search(low)),
            "imageUrl": img, "imageAttribution": attrib,
            "source": "USDA_SR_LEGACY",
            "nutritionSource": "USDA FoodData Central (SR Legacy, public domain)",
        })
        kept += 1
    combined = curated + out
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False)
    cats = {}
    for x in combined:
        cats[x["category"]] = cats.get(x["category"], 0) + 1
    with_img = sum(1 for x in combined if x.get("imageUrl"))
    with_iron = sum(1 for x in combined if x.get("ironMg") is not None)
    print(f"\nwrote {len(combined)} foods ({len(curated)} curated + {kept} USDA; skipped {skipped} incomplete) -> {OUT}")
    print(f"  with image: {with_img} | with iron/micros: {with_iron}")
    print(f"  categories: {cats}")


if __name__ == "__main__":
    main()
