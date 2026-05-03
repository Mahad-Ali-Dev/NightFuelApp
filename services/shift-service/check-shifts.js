const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient();
async function main() {
    const shifts = await prisma.shift.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
    console.log('Total shifts found:', shifts.length);
    shifts.forEach(s => {
        console.log(JSON.stringify({ id: s.id, date: s.shiftDate, type: s.shiftType, userId: s.userId }));
    });
    await prisma.$disconnect();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
