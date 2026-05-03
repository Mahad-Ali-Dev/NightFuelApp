const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.post.create({ data: { authorId: 'test', content: 'hello' } });
        console.log("Success");
    } catch (e) {
        console.error("DB_ERROR:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
