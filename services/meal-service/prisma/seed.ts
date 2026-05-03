import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const foodItems = [
    // === High-Protein Sources (critical for shift workers — muscle preservation) ===
    { name: 'Grilled Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, servingSize: '100g', glycemicIndex: 0, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Canned Tuna in Water', calories: 116, protein: 26, carbs: 0, fat: 1, servingSize: '100g', glycemicIndex: 0, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Salmon Fillet (Baked)', calories: 208, protein: 20, carbs: 0, fat: 13, servingSize: '100g', glycemicIndex: 0, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Whey Protein Shake', calories: 150, protein: 25, carbs: 5, fat: 2, servingSize: '300ml', glycemicIndex: 20, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Greek Yogurt (Plain, 0%)', calories: 59, protein: 10, carbs: 3.6, fat: 0.4, servingSize: '100g', glycemicIndex: 11, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Boiled Eggs (2 large)', calories: 155, protein: 13, carbs: 1.1, fat: 11, servingSize: '2 eggs (100g)', glycemicIndex: 0, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Cottage Cheese (Low-fat)', calories: 98, protein: 11, carbs: 3.4, fat: 4.3, servingSize: '100g', glycemicIndex: 10, isVegan: false, isGlutenFree: true, isHalal: true },

    // === Complex Carbohydrates (low-GI — ideal pre/post anchor meals) ===
    { name: 'Oatmeal (Plain, Cooked)', calories: 71, protein: 2.5, carbs: 12, fat: 1.4, servingSize: '100g cooked', glycemicIndex: 55, isVegan: true, isGlutenFree: false, isHalal: true },
    { name: 'Brown Rice (Cooked)', calories: 111, protein: 2.6, carbs: 23, fat: 0.9, servingSize: '100g cooked', glycemicIndex: 50, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Quinoa (Cooked)', calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9, servingSize: '100g cooked', glycemicIndex: 53, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Sweet Potato (Baked)', calories: 90, protein: 2, carbs: 21, fat: 0.1, servingSize: '100g', glycemicIndex: 61, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Whole Grain Bread (2 slices)', calories: 138, protein: 5.6, carbs: 24, fat: 2, servingSize: '2 slices (60g)', glycemicIndex: 53, isVegan: true, isGlutenFree: false, isHalal: true },
    { name: 'Lentils (Cooked)', calories: 116, protein: 9, carbs: 20, fat: 0.4, servingSize: '100g cooked', glycemicIndex: 32, isVegan: true, isGlutenFree: true, isHalal: true },

    // === Healthy Fats (sustained energy — critical for night shift alertness) ===
    { name: 'Avocado (Half)', calories: 160, protein: 2, carbs: 8.5, fat: 14.7, servingSize: '100g (half)', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Almonds (Raw)', calories: 579, protein: 21, carbs: 22, fat: 50, servingSize: '100g (~70 nuts)', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Walnuts', calories: 654, protein: 15, carbs: 14, fat: 65, servingSize: '100g', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Peanut Butter (Natural)', calories: 588, protein: 25, carbs: 20, fat: 50, servingSize: '100g', glycemicIndex: 14, isVegan: true, isGlutenFree: true, isHalal: true },

    // === Vegetables (fiber, micronutrients) ===
    { name: 'Broccoli (Steamed)', calories: 35, protein: 2.4, carbs: 7.2, fat: 0.4, servingSize: '100g', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Spinach (Raw)', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, servingSize: '100g', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Mixed Salad Greens', calories: 15, protein: 1.3, carbs: 2.2, fat: 0.2, servingSize: '100g', glycemicIndex: 10, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Cherry Tomatoes', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, servingSize: '100g', glycemicIndex: 15, isVegan: true, isGlutenFree: true, isHalal: true },

    // === Fruits (quick energy — strategic use around workouts) ===
    { name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, servingSize: '1 medium (100g)', glycemicIndex: 62, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Apple', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, servingSize: '1 medium (150g)', glycemicIndex: 36, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Blueberries', calories: 57, protein: 0.7, carbs: 14, fat: 0.3, servingSize: '100g', glycemicIndex: 53, isVegan: true, isGlutenFree: true, isHalal: true },

    // === Complete Meals (common shift worker prep) ===
    { name: 'Chicken Rice Bowl', calories: 420, protein: 35, carbs: 45, fat: 8, servingSize: '1 bowl (~400g)', glycemicIndex: 50, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Grilled Chicken Salad', calories: 380, protein: 35, carbs: 10, fat: 18, servingSize: '1 large bowl (~350g)', glycemicIndex: 15, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Oatmeal with Berries and Honey', calories: 320, protein: 10, carbs: 60, fat: 5, servingSize: '1 bowl (~350g)', glycemicIndex: 52, isVegan: true, isGlutenFree: false, isHalal: true },
    { name: 'Salmon with Brown Rice and Broccoli', calories: 520, protein: 38, carbs: 45, fat: 14, servingSize: '1 plate (~500g)', glycemicIndex: 45, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Quinoa and Roasted Vegetables Bowl', calories: 380, protein: 12, carbs: 55, fat: 12, servingSize: '1 bowl (~400g)', glycemicIndex: 45, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Egg and Veggie Omelette', calories: 220, protein: 16, carbs: 5, fat: 15, servingSize: '1 omelette (2 eggs + veggies)', glycemicIndex: 5, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Lentil Soup', calories: 230, protein: 14, carbs: 35, fat: 2, servingSize: '1 bowl (~300ml)', glycemicIndex: 32, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Turkey and Avocado Wrap', calories: 450, protein: 30, carbs: 35, fat: 18, servingSize: '1 wrap (~280g)', glycemicIndex: 50, isVegan: false, isGlutenFree: false, isHalal: true },
    { name: 'Overnight Oats with Protein', calories: 380, protein: 22, carbs: 52, fat: 8, servingSize: '1 jar (~350g)', glycemicIndex: 50, isVegan: false, isGlutenFree: false, isHalal: true },

    // === Quick Snacks ===
    { name: 'Protein Bar', calories: 200, protein: 20, carbs: 22, fat: 7, servingSize: '1 bar (55g)', glycemicIndex: 40, isVegan: false, isGlutenFree: false, isHalal: true },
    { name: 'Rice Cakes with Peanut Butter', calories: 180, protein: 5, carbs: 24, fat: 8, servingSize: '2 rice cakes + 1 tbsp PB', glycemicIndex: 65, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Greek Yogurt with Berries', calories: 150, protein: 12, carbs: 18, fat: 2, servingSize: '150g yogurt + 50g berries', glycemicIndex: 25, isVegan: false, isGlutenFree: true, isHalal: true },
    { name: 'Hummus with Carrot Sticks', calories: 160, protein: 6, carbs: 18, fat: 8, servingSize: '4 tbsp hummus + 100g carrots', glycemicIndex: 28, isVegan: true, isGlutenFree: true, isHalal: true },

    // === Beverages ===
    { name: 'Black Coffee', calories: 2, protein: 0.3, carbs: 0, fat: 0, servingSize: '240ml', glycemicIndex: 0, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Green Tea', calories: 2, protein: 0, carbs: 0.5, fat: 0, servingSize: '240ml', glycemicIndex: 0, isVegan: true, isGlutenFree: true, isHalal: true },
    { name: 'Protein Shake (Milk-based)', calories: 250, protein: 30, carbs: 20, fat: 5, servingSize: '400ml', glycemicIndex: 30, isVegan: false, isGlutenFree: true, isHalal: true },
];

async function main() {
    console.log(`Seeding ${foodItems.length} food items...`);

    // Clear and re-seed — idempotent for dev environments
    const deleted = await prisma.foodItem.deleteMany({});
    console.log(`  Cleared ${deleted.count} existing rows.`);

    const created = await prisma.foodItem.createMany({
        data: foodItems,
    });

    console.log(`Seeded ${created.count} food items successfully.`);
}

main()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
