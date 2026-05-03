import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const foods = [
    // US Region
    { name: 'Oatmeal with Blueberries', calories: 350, protein: 12, carbs: 60, fat: 8, servingSize: '1 bowl', region: 'us', cuisineTags: ['american', 'breakfast'] },
    { name: 'Grilled Chicken & Quinoa', calories: 550, protein: 45, carbs: 50, fat: 15, servingSize: '1 plate', region: 'us', cuisineTags: ['american', 'lunch'] },

    // Asia-Pacific (AP)
    { name: 'Red Lentils (Daal) & Rice', calories: 480, protein: 20, carbs: 85, fat: 10, servingSize: '1 bowl', region: 'ap', cuisineTags: ['indian', 'vegetarian'] },
    { name: 'Stir-fry Tofu with Bok Choy', calories: 320, protein: 18, carbs: 15, fat: 22, servingSize: '1 bowl', region: 'ap', cuisineTags: ['chinese', 'vegan'] },

    // Europe (EU)
    { name: 'Mediterranean Greek Salad', calories: 280, protein: 8, carbs: 12, fat: 24, servingSize: '1 bowl', region: 'eu', cuisineTags: ['mediterranean', 'salad'] },
    { name: 'Spinach & Ricotta Ravioli', calories: 420, protein: 15, carbs: 55, fat: 18, servingSize: '1 plate', region: 'eu', cuisineTags: ['italian', 'pasta'] },
];

async function main() {
    console.log('Seeding regional foods...');
    for (const food of foods) {
        await prisma.foodItem.create({
            data: food,
        });
    }
    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
