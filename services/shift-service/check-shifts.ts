import { PrismaClient } from './src/generated/prisma';
const prisma = new PrismaClient();
async function main() {
    const shifts = await prisma.shift.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
    console.log('Total shifts found:', shifts.length);
    shifts.forEach(s => {
        console.log(  ID: , date: , type: , user: );
    });
    await prisma.();
}
main().catch(e => { console.error(e); process.exit(1); });
