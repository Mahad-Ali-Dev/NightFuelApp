import { PrismaClient } from './src/generated/prisma';

const prisma = new PrismaClient();

async function check() {
    try {
        console.log('Checking database connection and schema...');
        const userCount = await prisma.user.count();
        console.log(`Total users in auth-service: ${userCount}`);

        const users = await prisma.user.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' }
        });

        console.log('User Onboarding Status:');
        users.forEach(u => {
            console.log(`Email: ${u.email} | Onboarding: ${u.onboardingCompleted}`);
        });

        await prisma.$disconnect();
    } catch (err) {
        console.error('Diagnostic failed:', err);
        process.exit(1);
    }
}

check();
