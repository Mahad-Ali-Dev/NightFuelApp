const axios = require('axios');
async function run() {
  try {
    const login = await axios.post('http://localhost:3001/v1/auth/login', { email: 'test@example.com', password: 'password123' });
    const token = login.data.accessToken;
    const shift = await axios.post('http://localhost:3002/', {
      shiftDate: '2026-03-27',
      startTime: '2026-03-27T09:00:00.000Z',
      endTime: '2026-03-27T17:00:00.000Z',
      shiftType: 'ROTATING',
      isDayOff: false,
      commuteMinutes: 0
    }, { headers: { Authorization: 'Bearer ' + token } });
    console.log('SUCCESS:', shift.data);
  } catch(e) {
    console.error('ERROR RESPONSE:', e.response ? e.response.data : e.message);
  }
}
run();
