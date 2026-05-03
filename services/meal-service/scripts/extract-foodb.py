"""
extract-foodb.py — FoodDB ETL for NightFuel meal-service
=========================================================
Reads foodb_2020_04_07_json.zip, joins Food + Nutrient + Content,
computes per-food macros, and writes foodb-foods.json ready for
the TypeScript seeder (seed-foodb.ts).

Usage:
    python extract-foodb.py <path-to-foodb_2020_04_07_json.zip> [output.json]

Default output: ./foodb-foods.json
"""

import sys, json, zipfile, statistics
from collections import defaultdict

# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────
ZIP_PATH   = sys.argv[1] if len(sys.argv) > 1 else 'foodb_2020_04_07_json.zip'
OUT_PATH   = sys.argv[2] if len(sys.argv) > 2 else 'foodb-foods.json'
PREFIX     = 'foodb_2020_04_07_json/'

# Nutrient IDs we care about (from Nutrient.json)
MACRO_IDS = {
    1:  'fat',
    2:  'protein',
    3:  'carbs',
    5:  'fiber',
    38: 'calories',   # Energy — kcal/100 g
}

# Food groups that are vegan-safe (no animal products)
VEGAN_GROUPS = {
    'Vegetables', 'Fruits', 'Herbs and Spices', 'Cereals and cereal products',
    'Pulses', 'Nuts', 'Gourds', 'Soy', 'Fats and oils', 'Baking goods',
    'Teas', 'Coffee and coffee products',
}

# Food groups that are generally gluten-free
GLUTEN_FREE_GROUPS = {
    'Vegetables', 'Fruits', 'Aquatic foods', 'Animal foods', 'Milk and milk products',
    'Eggs', 'Nuts', 'Pulses', 'Soy', 'Herbs and Spices', 'Gourds',
    'Teas', 'Coffee and coffee products',
}

# food_group → cuisine_tag mapping
GROUP_TO_TAG = {
    'Vegetables':                    'vegetables',
    'Fruits':                        'fruits',
    'Herbs and Spices':              'herbs-spices',
    'Cereals and cereal products':   'grains',
    'Pulses':                        'legumes',
    'Nuts':                          'nuts-seeds',
    'Aquatic foods':                 'seafood',
    'Animal foods':                  'meat',
    'Milk and milk products':        'dairy',
    'Eggs':                          'eggs',
    'Dishes':                        'dishes',
    'Baking goods':                  'baked-goods',
    'Beverages':                     'beverages',
    'Confectioneries':               'sweets',
    'Gourds':                        'vegetables',
    'Soy':                           'legumes',
    'Fats and oils':                 'fats-oils',
    'Snack foods':                   'snacks',
    'Cocoa and cocoa products':      'chocolate',
    'Teas':                          'beverages',
    'Coffee and coffee products':    'beverages',
    'Baby foods':                    'other',
}


def read_ndjson(zf: zipfile.ZipFile, path: str):
    """Read a newline-delimited JSON file from a zipfile."""
    records = []
    with zf.open(path) as f:
        for line in f:
            line = line.decode('utf-8').strip()
            if line:
                records.append(json.loads(line))
    return records


def median_or_none(values: list):
    """Return median of a list, or None if empty."""
    clean = [v for v in values if v is not None and v >= 0]
    if not clean:
        return None
    return statistics.median(clean)


def main():
    print(f'[1/4] Opening {ZIP_PATH} ...')
    z = zipfile.ZipFile(ZIP_PATH)

    # ── Step 1: Load Food catalog ─────────────────────────────────────────────
    print('[2/4] Loading Food catalog (992 items) ...')
    raw_foods = read_ndjson(z, PREFIX + 'Food.json')
    foods = {}  # id -> dict
    for f in raw_foods:
        foods[f['id']] = {
            'id':         f['id'],
            'name':       f['name'].strip(),
            'scientific': f.get('name_scientific', ''),
            'food_group': f.get('food_group') or 'Unclassified',
            'public_id':  f.get('public_id', ''),
        }
    print(f'    Loaded {len(foods)} foods')

    # ── Step 2: Build nutrient lookup ─────────────────────────────────────────
    print('[3/4] Scanning 5.69M content records (this takes ~30s) ...')
    # Structure: {food_id: {nutrient_key: [values]}}
    macro_buckets = defaultdict(lambda: defaultdict(list))

    with z.open(PREFIX + 'Content.json') as f:
        for line in f:
            line = line.decode('utf-8').strip()
            if not line:
                continue
            r = json.loads(line)

            # Only process Nutrient-type records (not Compound)
            if r.get('source_type') != 'Nutrient':
                continue

            source_id = r.get('source_id')
            if source_id not in MACRO_IDS:
                continue

            food_id = r.get('food_id')
            if food_id not in foods:
                continue

            # Determine value and unit
            raw_val  = r.get('standard_content') or r.get('orig_content')
            raw_unit = (r.get('orig_unit') or '').strip()

            if raw_val is None:
                continue

            try:
                val = float(raw_val)
            except (ValueError, TypeError):
                continue

            if val < 0:
                continue  # skip negative sentinel values

            macro_key = MACRO_IDS[source_id]

            if macro_key == 'calories':
                # Only accept kcal/100 g records for Energy
                if 'kcal' not in raw_unit.lower():
                    continue
                # Store as-is (already kcal/100g)
                macro_buckets[food_id]['calories'].append(val)

            else:
                # Fat, Protein, Carbs, Fiber — unit must be mg/100 g
                if raw_unit not in ('mg/100 g', ''):
                    continue
                # Convert mg → g (per 100g serving)
                macro_buckets[food_id][macro_key].append(val / 1000.0)

    print(f'    Content records processed for {len(macro_buckets)} foods')

    # ── Step 3: Build output records ──────────────────────────────────────────
    print('[4/4] Assembling food records ...')
    output = []
    skipped = 0

    for food_id, food in foods.items():
        buckets = macro_buckets.get(food_id, {})

        calories = median_or_none(buckets.get('calories', []))
        protein  = median_or_none(buckets.get('protein',  []))
        carbs    = median_or_none(buckets.get('carbs',    []))
        fat      = median_or_none(buckets.get('fat',      []))
        fiber    = median_or_none(buckets.get('fiber',    []))

        # Require at least calories OR two macros
        has_enough = (calories is not None) or (
            sum(x is not None for x in [protein, carbs, fat]) >= 2
        )
        if not has_enough:
            skipped += 1
            continue

        # Estimate calories from macros if missing: 4*P + 4*C + 9*F
        if calories is None and protein is not None and carbs is not None and fat is not None:
            calories = round(4 * protein + 4 * carbs + 9 * fat, 2)

        group = food['food_group']
        tag   = GROUP_TO_TAG.get(group, 'other')

        output.append({
            'name':        food['name'],
            'scientific':  food['scientific'],
            'foodGroup':   group,
            'calories':    round(calories or 0,  2),
            'protein':     round(protein  or 0,  2),
            'carbs':       round(carbs    or 0,  2),
            'fat':         round(fat      or 0,  2),
            'fiber':       round(fiber    or 0,  2),
            'servingSize': '100g',
            'isVegan':     group in VEGAN_GROUPS,
            'isGlutenFree': group in GLUTEN_FREE_GROUPS,
            'isHalal':     group not in {'Animal foods', 'Aquatic foods'},
            'region':      None,
            'cuisineTags': [tag],
            'source':      'FOODB',
            'fooDbId':     food['public_id'],
        })

    output.sort(key=lambda x: x['name'])

    print(f'    Exported : {len(output)} foods')
    print(f'    Skipped  : {skipped} (insufficient macro data)')

    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)

    print(f'\nDone! Written to {OUT_PATH}')
    print(f'Run: npx ts-node src/seed-foodb.ts (from meal-service dir)')


if __name__ == '__main__':
    main()
