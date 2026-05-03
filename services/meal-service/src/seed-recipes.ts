import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

const MOCK_RECIPES = [
    {
        title: 'High-Protein Chicken Quinoa Bowl',
        description: 'A quick, macro-friendly meal prep staple packed with lean protein and complex carbs.',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
        prepTimeMins: 25,
        cookTimeMins: 0,
        calories: 520,
        protein: 45,
        carbs: 55,
        fat: 12,
        tags: ['High Protein', 'Meal Prep', 'Lunch'],
        ingredients: [
            '200g Chicken Breast',
            '100g Quinoa (cooked)',
            '50g Cherry Tomatoes',
            '1/4 Avocado',
            '1 tbsp Olive Oil',
            'Squeeze of Lemon'
        ],
        instructions: [
            'Season chicken breast with salt, pepper, and paprika.',
            'Grill or pan-fry the chicken for 6-8 minutes per side until fully cooked.',
            'While chicken cooks, prepare quinoa according to package instructions.',
            'Dice tomatoes and slice avocado.',
            'Combine quinoa, chicken, and veggies in a bowl. Drizzle with olive oil and lemon.'
        ]
    },
    {
        title: 'Post-Workout Berry Smoothie',
        description: 'Fast-digesting carbs and whey isolate for optimal recovery after heavy lifting.',
        image: 'https://images.unsplash.com/photo-1628557044797-f21a177c37ec?w=800&q=80',
        prepTimeMins: 5,
        cookTimeMins: 0,
        calories: 340,
        protein: 30,
        carbs: 45,
        fat: 5,
        tags: ['Post-Workout', 'Breakfast', 'Quick'],
        ingredients: [
            '1 Scoop Whey Protein Isolate',
            '1 Cup Mixed Frozen Berries',
            '1/2 Banana',
            '1 Cup Almond Milk',
            '1 tbsp Honey'
        ],
        instructions: [
            'Add almond milk to the blender first.',
            'Add the whey protein, followed by the frozen berries and banana.',
            'Drizzle in the honey.',
            'Blend on high for 45-60 seconds until smooth.'
        ]
    },
    {
        title: 'Lean Steak & Sweet Potato Mash',
        description: 'A hearty, nutrient-dense dinner perfect for building mass.',
        image: 'https://images.unsplash.com/photo-1554160454-e74f85e43444?w=800&q=80',
        prepTimeMins: 15,
        cookTimeMins: 20,
        calories: 680,
        protein: 55,
        carbs: 60,
        fat: 22,
        tags: ['Dinner', 'Mass Building', 'High Protein'],
        ingredients: [
            '250g Sirloin Steak (trimmed)',
            '200g Sweet Potato',
            '100g Asparagus',
            '1 tbsp Grass-fed Butter',
            'Garlic & Rosemary'
        ],
        instructions: [
            'Peel and dice sweet potato. Boil for 15-20 mins until fork-tender.',
            'Season steak aggressively with salt and pepper.',
            'Heat a cast-iron skillet on high. Sear steak for 3-4 mins per side for medium-rare.',
            'Add butter, garlic, and rosemary to the pan, basting the steak for 1 minute.',
            'Rest steak for 5 minutes. Mash the sweet potato and quickly char the asparagus.'
        ]
    }
];

async function seed() {
    console.log('Seeding recipes...');
    for (const recipe of MOCK_RECIPES) {
        await prisma.recipe.create({
            data: {
                ...recipe,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions
            }
        });
    }
    console.log('Seeding complete.');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
