import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const exercises = [
    { name: 'Pushups', muscleGroup: 'CHEST', equipment: 'BODYWEIGHT' },
    { name: 'Pullups', muscleGroup: 'BACK', equipment: 'PULLUP_BAR' },
    { name: 'Squats', muscleGroup: 'LEGS', equipment: 'BODYWEIGHT' },
    { name: 'Deadlift', muscleGroup: 'BACK/LEGS', equipment: 'BARBELL' },
    { name: 'Bench Press', muscleGroup: 'CHEST', equipment: 'BARBELL' },
    { name: 'Overhead Press', muscleGroup: 'SHOULDERS', equipment: 'BARBELL' },
    { name: 'Barbell Row', muscleGroup: 'BACK', equipment: 'BARBELL' },
    { name: 'Lunges', muscleGroup: 'LEGS', equipment: 'BODYWEIGHT' },
    { name: 'Plank', muscleGroup: 'CORE', equipment: 'BODYWEIGHT' },
    { name: 'Bicep Curls', muscleGroup: 'BICEPS', equipment: 'DUMBBELLS' },
    { name: 'Tricep Dips', muscleGroup: 'TRICEPS', equipment: 'BODYWEIGHT' },
    { name: 'Running', muscleGroup: 'CARDIO', equipment: 'NONE' },
    { name: 'Cycling', muscleGroup: 'CARDIO', equipment: 'BIKE' },
];

async function main() {
    console.log('Seeding exercises...');
    for (const ex of exercises) {
        await prisma.libraryExercise.upsert({
            where: { name: ex.name },
            update: {},
            create: ex,
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
