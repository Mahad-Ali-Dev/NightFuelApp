import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const SHIFT_SERVICE_URL = 'http://localhost:3002/v1/shifts';
const JWT_SECRET = 'dev-secret'; // Must match docker-compose/env
const USER_ID = randomUUID();

const token = jwt.sign({ userId: USER_ID, role: 'USER' }, JWT_SECRET, { expiresIn: '1h' });

async function main() {
    console.log('--- Verifying Shift Service ---');
    console.log(`User ID: ${USER_ID}`);
    console.log(`Token: ${token}`);

    // 1. Create Shift
    console.log('\n1. Creating Shift...');
    const match = new Date().toISOString().match(/^(\d{4}-\d{2}-\d{2})/);
    const today = match ? match[1] : '2023-01-01'; // Fallback just in case

    const createRes = await fetch(SHIFT_SERVICE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            userId: USER_ID, // Should be ignored/overwritten by token in service, but schema might require it? No, schema has it but we override it in route.
            shiftDate: today,
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            shiftType: 'ROTATING',
            isDayOff: false,
            commuteMinutes: 30
        })
    });

    const createData = await createRes.json().catch(() => ({})) as any;
    console.log(`Status: ${createRes.status}`, createData);
    if (createRes.status !== 201) process.exit(1);
    const shiftId = createData.id;

    // 2. Get Shifts
    console.log('\n2. Getting Shifts...');
    const getRes = await fetch(`${SHIFT_SERVICE_URL}?start=${today}&end=${today}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const getData = await getRes.json().catch(() => ({})) as any;
    console.log(`Status: ${getRes.status}`, `Count: ${Array.isArray(getData) ? getData.length : 0}`);
    if (getRes.status !== 200 || !Array.isArray(getData) || getData.length === 0) process.exit(1);

    // 3. Get Shift by ID
    console.log(`\n3. Getting Shift by ID (${shiftId})...`);
    const getOneRes = await fetch(`${SHIFT_SERVICE_URL}/${shiftId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const getOneData = await getOneRes.json().catch(() => ({})) as any;
    console.log(`Status: ${getOneRes.status}`, getOneData.id);
    if (getOneRes.status !== 200 || getOneData.id !== shiftId) process.exit(1);

    // 4. Update Shift
    console.log('\n4. Updating Shift...');
    const updateRes = await fetch(`${SHIFT_SERVICE_URL}/${shiftId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            commuteMinutes: 45
        })
    });
    const updateData = await updateRes.json().catch(() => ({})) as any;
    console.log(`Status: ${updateRes.status}`, `Commute: ${updateData.commuteMinutes}`);
    if (updateRes.status !== 200 || updateData.commuteMinutes !== 45) process.exit(1);

    // 5. Delete Shift
    console.log('\n5. Deleting Shift...');
    const deleteRes = await fetch(`${SHIFT_SERVICE_URL}/${shiftId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Status: ${deleteRes.status}`);
    if (deleteRes.status !== 204) process.exit(1);

    // Verify deletion
    const verifyDelRes = await fetch(`${SHIFT_SERVICE_URL}/${shiftId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Verify Deletion Status: ${verifyDelRes.status}`);
    if (verifyDelRes.status !== 404) process.exit(1);

    console.log('\n✅ Verification Successful!');
}

main().catch(console.error);
