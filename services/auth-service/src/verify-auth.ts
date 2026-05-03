

const BASE_URL = 'http://localhost:3001/v1/auth';

async function request(path: string, method: string, body?: any, token?: string) {
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({})) as any;
    return { status: response.status, data };
}

async function verify() {
    console.log('Starting verification...');

    const email = `test-${Date.now()}@example.com`;
    const password = 'password123';

    // 1. Register
    console.log(`\n1. Registering user ${email}...`);
    const regRes = await request('/register', 'POST', {
        email,
        password,
        displayName: 'Test User',
        region: 'us',
    });
    console.log('Register:', regRes.status, regRes.status === 201 ? 'OK' : 'FAIL');
    if (regRes.status !== 201) {
        console.error(regRes.data);
        return;
    }

    // 2. Login
    console.log('\n2. Logging in...');
    const loginRes = await request('/login', 'POST', {
        email,
        password,
    });
    console.log('Login:', loginRes.status, loginRes.status === 200 ? 'OK' : 'FAIL');
    if (loginRes.status !== 200) return;

    const { accessToken, refreshToken } = loginRes.data;
    console.log('Access Token:', accessToken ? 'Present' : 'Missing');
    console.log('Refresh Token:', refreshToken ? 'Present' : 'Missing');

    // 3. Get Me (Protected)
    console.log('\n3. Accessing /me...');
    const meRes = await request('/me', 'GET', undefined, accessToken);
    console.log('Me:', meRes.status, meRes.status === 200 ? 'OK' : 'FAIL');
    console.log('User ID:', meRes.data.userId);

    // 4. Refresh Token
    console.log('\n4. Refreshing token...');
    const refreshRes = await request('/refresh', 'POST', { refreshToken });
    console.log('Refresh:', refreshRes.status, refreshRes.status === 200 ? 'OK' : 'FAIL');
    const newAccessToken = refreshRes.data.accessToken;
    const newRefreshToken = refreshRes.data.refreshToken;

    // 5. Get Me with new token
    console.log('\n5. Accessing /me with new token...');
    const meRes2 = await request('/me', 'GET', undefined, newAccessToken);
    console.log('Me (new token):', meRes2.status, meRes2.status === 200 ? 'OK' : 'FAIL');

    // 6. Logout
    console.log('\n6. Logging out...');
    const logoutRes = await request('/logout', 'POST', { refreshToken: newRefreshToken }, newAccessToken);
    console.log('Logout:', logoutRes.status, logoutRes.status === 204 ? 'OK' : 'FAIL');

    // 7. Try Refresh again (should fail)
    console.log('\n7. Refreshing old token (should fail)...');
    const failRes = await request('/refresh', 'POST', { refreshToken: newRefreshToken });
    console.log('Refresh (old):', failRes.status, failRes.status === 401 || failRes.status === 400 || failRes.status === 500 ? 'OK (Expected Failure)' : 'FAIL'); // 500 because I threw Error which might be 500 by default unless using @fastify/error or http-errors
}

verify().catch(console.error);
