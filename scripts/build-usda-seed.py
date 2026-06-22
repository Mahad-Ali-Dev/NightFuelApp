#!/usr/bin/env python3
"""
Build the expanded food catalog from USDA FoodData Central (SR Legacy, public
domain) — macros AND micronutrients — for a curated list of whole foods + staples
covering everyone. Images are added by a separate Open Food Facts pass
(build-off-images.py) so this stays fast and rate-limit-free.

Downloads the SR Legacy bulk JSON once (no API key), matches each curated food by
description, extracts the nutrients we store, and writes the seed JSON.

Run:  python scripts/build-usda-seed.py
Out:  services/meal-service/prisma/data/openfoodfacts-seed.json
"""
import io
import json
import os
import urllib.request
import zipfile

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "services", "meal-service", "prisma", "data", "openfoodfacts-seed.json")
SR_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip"

# USDA nutrient name -> our field (unit-normalized: kcal, g, mg, mcg as stored).
NUTRIENT_MAP = {
    "Energy": ("calories", "KCAL"),
    "Protein": ("protein", None),
    "Carbohydrate, by difference": ("carbs", None),
    "Total lipid (fat)": ("fat", None),
    "Fiber, total dietary": ("fiber", None),
    "Sugars, total including NLEA": ("sugar", None),
    "Sodium, Na": ("sodiumMg", None),
    "Iron, Fe": ("ironMg", None),
    "Magnesium, Mg": ("magnesiumMg", None),
    "Calcium, Ca": ("calciumMg", None),
    "Potassium, K": ("potassiumMg", None),
    "Zinc, Zn": ("zincMg", None),
    "Vitamin C, total ascorbic acid": ("vitaminCMg", None),
    "Vitamin B-6": ("vitaminB6Mg", None),
    "Vitamin B-12": ("vitaminB12Mcg", None),
    "Folate, total": ("folateMcg", None),
    "Vitamin D (D2 + D3)": ("vitaminDMcg", None),
}

# display, USDA match term (substring, lowercased), category, foodGroup, vegan, glutenFree
FOODS = [
    # Fruits
    ("Banana", "bananas, raw", "fruit", "Fruits", True, True),
    ("Apple", "apples, raw, with skin", "fruit", "Fruits", True, True),
    ("Orange", "oranges, raw, all", "fruit", "Fruits", True, True),
    ("Strawberries", "strawberries, raw", "fruit", "Fruits", True, True),
    ("Blueberries", "blueberries, raw", "fruit", "Fruits", True, True),
    ("Raspberries", "raspberries, raw", "fruit", "Fruits", True, True),
    ("Grapes", "grapes, red or green", "fruit", "Fruits", True, True),
    ("Watermelon", "watermelon, raw", "fruit", "Fruits", True, True),
    ("Mango", "mangos, raw", "fruit", "Fruits", True, True),
    ("Pineapple", "pineapple, raw, all", "fruit", "Fruits", True, True),
    ("Avocado", "avocados, raw, all", "fruit", "Fruits", True, True),
    ("Kiwifruit", "kiwifruit, green, raw", "fruit", "Fruits", True, True),
    ("Pear", "pears, raw", "fruit", "Fruits", True, True),
    ("Peach", "peaches, raw", "fruit", "Fruits", True, True),
    ("Cherries", "cherries, sweet, raw", "fruit", "Fruits", True, True),
    ("Pomegranate", "pomegranates, raw", "fruit", "Fruits", True, True),
    ("Cantaloupe", "melons, cantaloupe, raw", "fruit", "Fruits", True, True),
    ("Dates", "dates, medjool", "fruit", "Fruits", True, True),
    # Vegetables
    ("Spinach", "spinach, raw", "vegetable", "Vegetables", True, True),
    ("Broccoli", "broccoli, raw", "vegetable", "Vegetables", True, True),
    ("Carrot", "carrots, raw", "vegetable", "Vegetables", True, True),
    ("Tomato", "tomatoes, red, ripe, raw, year", "vegetable", "Vegetables", True, True),
    ("Potato", "potatoes, flesh and skin, raw", "vegetable", "Vegetables", True, True),
    ("Sweet Potato", "sweet potato, raw, unprepared", "vegetable", "Vegetables", True, True),
    ("Bell Pepper", "peppers, sweet, red, raw", "vegetable", "Vegetables", True, True),
    ("Cucumber", "cucumber, with peel, raw", "vegetable", "Vegetables", True, True),
    ("Onion", "onions, raw", "vegetable", "Vegetables", True, True),
    ("Kale", "kale, raw", "vegetable", "Vegetables", True, True),
    ("Cauliflower", "cauliflower, raw", "vegetable", "Vegetables", True, True),
    ("Zucchini", "squash, summer, zucchini, includes skin, raw", "vegetable", "Vegetables", True, True),
    ("Green Beans", "beans, snap, green, raw", "vegetable", "Vegetables", True, True),
    ("Asparagus", "asparagus, raw", "vegetable", "Vegetables", True, True),
    ("Beetroot", "beets, raw", "vegetable", "Vegetables", True, True),
    ("Mushrooms", "mushrooms, white, raw", "vegetable", "Vegetables", True, True),
    ("Brussels Sprouts", "brussels sprouts, raw", "vegetable", "Vegetables", True, True),
    ("Cabbage", "cabbage, raw", "vegetable", "Vegetables", True, True),
    ("Swiss Chard", "chard, swiss, raw", "vegetable", "Vegetables", True, True),
    ("Pumpkin", "pumpkin, raw", "vegetable", "Vegetables", True, True),
    ("Corn", "corn, sweet, yellow, raw", "vegetable", "Vegetables", True, True),
    ("Peas", "peas, green, raw", "vegetable", "Vegetables", True, True),
    # Protein (animal + plant)
    ("Chicken Breast", "chicken, broilers or fryers, breast, meat only, raw", "protein", "Protein", False, True),
    ("Chicken Thigh", "chicken, broilers or fryers, thigh, meat only, raw", "protein", "Protein", False, True),
    ("Salmon", "fish, salmon, atlantic, farmed, raw", "protein", "Protein", False, True),
    ("Tuna", "fish, tuna, light, canned in water", "protein", "Protein", False, True),
    ("Cod", "fish, cod, atlantic, raw", "protein", "Protein", False, True),
    ("Sardines", "fish, sardine, atlantic, canned in oil", "protein", "Protein", False, True),
    ("Egg", "egg, whole, raw, fresh", "protein", "Protein", False, True),
    ("Lean Beef", "beef, ground, 90% lean", "protein", "Protein", False, True),
    ("Beef Steak", "beef, loin, top sirloin", "protein", "Protein", False, True),
    ("Turkey Breast", "turkey, breast, meat only, raw", "protein", "Protein", False, True),
    ("Pork Tenderloin", "pork, fresh, loin, tenderloin, lean, raw", "protein", "Protein", False, True),
    ("Shrimp", "crustaceans, shrimp, raw", "protein", "Protein", False, True),
    ("Tofu", "tofu, raw, firm", "protein", "Protein", True, True),
    ("Tempeh", "tempeh", "protein", "Protein", True, True),
    ("Cottage Cheese", "cheese, cottage, lowfat, 2%", "protein", "Protein", False, True),
    # Dairy
    ("Greek Yogurt", "yogurt, greek, plain, nonfat", "dairy", "Dairy", False, True),
    ("Milk", "milk, reduced fat, fluid, 2%", "dairy", "Dairy", False, True),
    ("Cheddar Cheese", "cheese, cheddar", "dairy", "Dairy", False, True),
    ("Mozzarella", "cheese, mozzarella, whole milk", "dairy", "Dairy", False, True),
    ("Butter", "butter, salted", "dairy", "Dairy", False, True),
    ("Feta Cheese", "cheese, feta", "dairy", "Dairy", False, True),
    ("Parmesan", "cheese, parmesan, grated", "dairy", "Dairy", False, True),
    # Grains
    ("Oats", "cereals, oats, regular and quick, unenriched, dry", "grain", "Grains", True, False),
    ("Brown Rice", "rice, brown, long-grain, raw", "grain", "Grains", True, True),
    ("White Rice", "rice, white, long-grain, regular, raw, unenriched", "grain", "Grains", True, True),
    ("Quinoa", "quinoa, uncooked", "grain", "Grains", True, True),
    ("Whole Wheat Bread", "bread, whole-wheat, commercially prepared", "grain", "Grains", True, False),
    ("Pasta", "pasta, dry, unenriched", "grain", "Grains", True, False),
    ("Buckwheat", "buckwheat", "grain", "Grains", True, True),
    ("Barley", "barley, hulled", "grain", "Grains", True, False),
    ("Couscous", "couscous, dry", "grain", "Grains", True, False),
    ("Cornmeal", "cornmeal, whole-grain, yellow", "grain", "Grains", True, True),
    # Legumes
    ("Lentils", "lentils, raw", "legume", "Legumes", True, True),
    ("Chickpeas", "chickpeas (garbanzo beans, bengal gram), mature seeds, raw", "legume", "Legumes", True, True),
    ("Black Beans", "beans, black, mature seeds, raw", "legume", "Legumes", True, True),
    ("Kidney Beans", "beans, kidney, red, mature seeds, raw", "legume", "Legumes", True, True),
    ("Pinto Beans", "beans, pinto, mature seeds, raw", "legume", "Legumes", True, True),
    ("Edamame", "soybeans, green, raw", "legume", "Legumes", True, True),
    ("Green Split Peas", "peas, split, mature seeds, raw", "legume", "Legumes", True, True),
    # Nuts & seeds
    ("Almonds", "nuts, almonds", "nut_seed", "Nuts & Seeds", True, True),
    ("Walnuts", "nuts, walnuts, english", "nut_seed", "Nuts & Seeds", True, True),
    ("Cashews", "nuts, cashew nuts, raw", "nut_seed", "Nuts & Seeds", True, True),
    ("Peanuts", "peanuts, all types, raw", "nut_seed", "Nuts & Seeds", True, True),
    ("Pumpkin Seeds", "seeds, pumpkin and squash seed kernels, dried", "nut_seed", "Nuts & Seeds", True, True),
    ("Sunflower Seeds", "seeds, sunflower seed kernels, dried", "nut_seed", "Nuts & Seeds", True, True),
    ("Chia Seeds", "seeds, chia seeds, dried", "nut_seed", "Nuts & Seeds", True, True),
    ("Flaxseed", "seeds, flaxseed", "nut_seed", "Nuts & Seeds", True, True),
    ("Peanut Butter", "peanut butter, smooth style", "nut_seed", "Nuts & Seeds", True, True),
    ("Pistachios", "nuts, pistachio nuts, raw", "nut_seed", "Nuts & Seeds", True, True),
]


def download_sr():
    print(f"downloading SR Legacy ({SR_URL.split('/')[-1]}) ...")
    req = urllib.request.Request(SR_URL, headers={"User-Agent": "NightFuel-seed/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        blob = r.read()
    print(f"  got {len(blob)//1024} KB; unzipping ...")
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = [n for n in z.namelist() if n.endswith(".json")][0]
        with z.open(name) as f:
            data = json.load(f)
    foods = data.get("SRLegacyFoods") or data.get("FoundationFoods") or []
    print(f"  loaded {len(foods)} SR Legacy foods")
    return foods


def extract_nutrients(food):
    out = {}
    for fn in food.get("foodNutrients", []):
        nut = fn.get("nutrient", {})
        name = nut.get("name", "")
        unit = nut.get("unitName", "")
        if name not in NUTRIENT_MAP:
            continue
        field, want_unit = NUTRIENT_MAP[name]
        amt = fn.get("amount")
        if amt is None:
            continue
        if field == "calories" and unit and unit.upper() != "KCAL":
            continue  # skip the kJ Energy row
        out[field] = round(float(amt), 2)
    return out


def main():
    sr = download_sr()
    index = [(f.get("description", "").lower(), f) for f in sr]
    out = []
    for (disp, term, cat, group, vegan, gf) in FOODS:
        match = None
        for desc, f in index:
            if term in desc:
                match = f
                break
        if not match:
            # looser: all words present
            words = term.replace(",", " ").split()
            for desc, f in index:
                if all(w in desc for w in words):
                    match = f
                    break
        if not match:
            print(f"  MISS  {disp}  (term: {term!r})")
            continue
        n = extract_nutrients(match)
        if "calories" not in n or "protein" not in n:
            print(f"  THIN  {disp}  (incomplete nutrients)")
            continue
        row = {
            "name": disp, "category": cat, "foodGroup": group,
            "calories": n.get("calories", 0), "protein": n.get("protein", 0),
            "carbs": n.get("carbs", 0), "fat": n.get("fat", 0),
            "fiber": n.get("fiber", 0), "sugar": n.get("sugar", 0),
            "sodiumMg": n.get("sodiumMg", 0),
            "ironMg": n.get("ironMg"), "magnesiumMg": n.get("magnesiumMg"),
            "calciumMg": n.get("calciumMg"), "potassiumMg": n.get("potassiumMg"),
            "zincMg": n.get("zincMg"), "vitaminCMg": n.get("vitaminCMg"),
            "vitaminB6Mg": n.get("vitaminB6Mg"), "vitaminB12Mcg": n.get("vitaminB12Mcg"),
            "folateMcg": n.get("folateMcg"), "vitaminDMcg": n.get("vitaminDMcg"),
            "servingSize": "100g",
            "isVegan": vegan, "isGlutenFree": gf, "isHalal": "pork" not in term and "bacon" not in term,
            "imageUrl": None, "imageAttribution": None,
            "source": "OPENFOODFACTS",  # image source; nutrition is USDA SR Legacy (public domain)
            "nutritionSource": "USDA FoodData Central (SR Legacy, public domain)",
        }
        out.append(row)
        print(f"  OK    {disp}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    micros = sum(1 for x in out if x.get("ironMg") is not None)
    print(f"\nwrote {len(out)} foods ({micros} with iron data) -> {OUT}")


if __name__ == "__main__":
    main()
