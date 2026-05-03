import fetch from 'node-fetch';

async function run() {
  try {
    const loginResp = await fetch('http://localhost:3001/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
    });
    const loginData = await loginResp.json();
    const token = loginData.accessToken;
    
    const shiftResp = await fetch('http://localhost:3002/v1/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        shiftDate: '2026-03-27',
        startTime: '2026-03-27T09:00:00.000Z',
        endTime: '2026-03-27T17:00:00.000Z',
        shiftType: 'ROTATING',
        isDayOff: false,
        commuteMinutes: 0
      })
    });
    
    const responseText = await shiftResp.text();
    console.log('STATUS:', shiftResp.status);
    console.log('RESPONSE:', responseText);
  } catch(e) {
    console.error('ERROR:', e.message);
  }
}
run();
