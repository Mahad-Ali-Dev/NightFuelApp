import axios from 'axios';

// Base URLs now rely directly on next.config.js `rewrites()` to bypass CORS via Next.js proxy
const AUTH_API_URL = '/api/auth';
const SHIFT_API_URL = '/api/shifts';
const CIRCADIAN_API_URL = '/api/circadian';
const AI_API_URL = '/api/ai';

export const api = axios.create({
    baseURL: AUTH_API_URL, // Default to auth for login/register
    headers: {
        'Content-Type': 'application/json',
    },
    // HIGH #1: send/receive the httpOnly refresh cookie (nf_refresh) on the
    // same-origin /api/auth/* calls (login / refresh / logout). The browser
    // stores that cookie itself; JS never sees it, so an XSS cannot steal it.
    withCredentials: true,
});

export const shiftApi = axios.create({
    baseURL: SHIFT_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// circadian-engine: POST /v1/circadian/profile
export const circadianApi = axios.create({
    baseURL: CIRCADIAN_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// plan-service: GET & POST /v1/plans
export const planApi = axios.create({
    baseURL: '/api/plans',
    headers: { 'Content-Type': 'application/json' },
});

export const generatePlan = async (data: {
    date: string;
    shiftId: string;
    shiftType: string;
    profileData?: any;
}) => {
    return planApi.post('/generate', data);
};

// meal-service: GET & POST /v1/meals
export const mealApi = axios.create({
    baseURL: '/api/meals',
    headers: { 'Content-Type': 'application/json' },
});

// progress-service: GET /v1/progress
export const progressApi = axios.create({
    baseURL: '/api/progress',
    headers: { 'Content-Type': 'application/json' },
});

export const getWeeklyStats = () => progressApi.get('/weekly-stats');
export const getWeeklyAudit = () => progressApi.post('/weekly-audit');
export const getTodayProgress = () => progressApi.get('/today');
export const getProgressHistory = (days = 7) => progressApi.get(`/history?days=${days}`);
export const getProgressStreak = () => progressApi.get('/streak');
export const getProgressStats = (days = 30) => progressApi.get(`/stats?days=${days}`);
export const logBodyMetrics = (data: { weightKg?: number; bodyFatPct?: number; chestCm?: number; waistCm?: number; hipsCm?: number; armCm?: number; thighCm?: number; calvesCm?: number }) => progressApi.post('/metrics', data);
export const getBodyMetrics = (days = 90) => progressApi.get(`/metrics?days=${days}`);
export const logHydration = (amount: number) => progressApi.post('/hydration', { amount });
export const toggleSupplement = (supplementName: string, isTaken: boolean) =>
    progressApi.post('/supplements', { supplementName, isTaken });
export const updateLightExposure = (completed: boolean) =>
    progressApi.post('/light-exposure', { completed });

// notification-service: GET & PUT /v1/notifications
export const notificationApi = axios.create({
    baseURL: '/api/notifications',
    headers: { 'Content-Type': 'application/json' },
});

// user-service: GET & PUT /v1/users
export const userApi = axios.create({
    baseURL: '/api/users',
    headers: { 'Content-Type': 'application/json' },
});

export const getStudents = () => userApi.get('/me/students');
export const assignProtocol = (studentId: string, protocolId: string | null) =>
    userApi.post(`/students/${studentId}/assign-protocol`, { protocolId });

// plan-service: protocols
export const getProtocols = () => planApi.get('/protocols');
export const createProtocol = (data: any) => planApi.post('/protocols', data);
export const deleteProtocol = (id: string) => planApi.delete(`/protocols/${id}`);

// subscription-service: GET & POST /v1/subscriptions
export const subscriptionApi = axios.create({
    baseURL: '/api/subscriptions',
    headers: { 'Content-Type': 'application/json' },
});

export const enrollAsCoach = () => subscriptionApi.post('/coach/onboard');
export const bookCoachSession = (coachId: string, amount: number) => subscriptionApi.post('/coach/checkout', { coachId, amount });

export const aiApi = axios.create({
    baseURL: AI_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const swapMeal = (data: {
    meal_to_swap: any;
    preferences: any;
    provider?: string;
}) => aiApi.post('/meal-swap', data);

export const scoreMeal = (data: {
    userId: string;
    meal: any;
    preferences: any;
}) => aiApi.post('/meal-score', data);

export const chatWithCoach = (data: {
    userId: string;
    message: string;
    history: any[];
    context: any;
}) => aiApi.post('/chat', data);

export const exerciseApi = axios.create({
    baseURL: '/api/exercises',
    headers: { 'Content-Type': 'application/json' },
});

export const logWorkout = (data: any) => exerciseApi.post('/', data);
export const getRecentWorkouts = (limit = 10) => exerciseApi.get(`/?limit=${limit}`);
export const getWorkoutById = (id: string) => exerciseApi.get(`/${id}`);
export const deleteWorkout = (id: string) => exerciseApi.delete(`/${id}`);

// Workout Sessions
export const startWorkoutSession = (routineId?: string) => exerciseApi.post('/session/start', { routineId });
export const getActiveWorkoutSession = () => exerciseApi.get('/session/active');
export const logSessionExercise = (sessionId: string, data: { exerciseName: string; sets: number; reps: number; weightKg: number; durationSecs: number }) => exerciseApi.post(`/session/${sessionId}/exercise/log`, data);
export const endWorkoutSession = (sessionId: string) => exerciseApi.post(`/session/${sessionId}/end`);
export const searchExerciseLibrary = (query: string) => exerciseApi.get(`/library?query=${query}`);
export const getExerciseHeatmap = () => exerciseApi.get('/history/heatmap');
export const getExerciseAnalytics = (exerciseName: string) => exerciseApi.get(`/analytics/${encodeURIComponent(exerciseName)}`);
export const getRoutines = () => exerciseApi.get('/routines');
export const createRoutine = (data: any) => exerciseApi.post('/routines', data);
export const getOneRepMaxes = () => exerciseApi.get('/1rm');
export const logOneRepMax = (data: { exerciseName: string; weightKg: number; estimated1RMKg: number }) => exerciseApi.post('/1rm', data);

// Community helpers
export const getCommunityFeed = () => communityApi.get('/feed');
export const getUserCommunityPosts = (userId: string) => communityApi.get(`/user/${userId}/posts`);
export const createCommunityPost = (data: { content: string; imageUrl?: string }) => communityApi.post('/post', data);
export const updateCommunityPost = (postId: string, content: string) => communityApi.put(`/post/${postId}`, { content });
export const deleteCommunityPost = (postId: string) => communityApi.delete(`/post/${postId}`);
export const likeCommunityPost = (postId: string) => communityApi.post(`/post/${postId}/like`);
export const commentOnPost = (postId: string, content: string) => communityApi.post(`/post/${postId}/comment`, { content });
export const getCommunityLeaderboard = () => communityApi.get('/leaderboard');
export const getChallenges = () => communityApi.get('/challenges');
export const joinChallenge = (challengeId: string) => communityApi.post(`/challenges/${challengeId}/join`);
export const updateChallengeProgress = (challengeId: string, progress: number) => communityApi.post(`/challenges/${challengeId}/progress`, { progress });

// Chat / Messages helpers
export const getCoachDirectory = () => chatApi.get('/directory');
export const getConversations = () => chatApi.get('/conversations');
export const startConversation = (targetUserId: string) => chatApi.post('/conversations', { targetUserId });
export const getMessages = (conversationId: string) => chatApi.get(`/conversations/${conversationId}/messages`);
export const sendChatMessage = (conversationId: string, text: string) => chatApi.post(`/conversations/${conversationId}/messages`, { text });

// Profile helpers
export const getMyProfile = () => userApi.get('/me');
export const updateMyProfile = (data: any) => userApi.patch('/me', data);
export const getPublicProfile = (userId: string) => userApi.get(`/public/${userId}`);

// ── GDPR (HIGH #2/#3) ─────────────────────────────────────────────────────────
// Right to erasure (Art. 17): permanently delete the signed-in user's account
// and all platform data. user-service fans the purge out to every service.
export const deleteAccount = () => userApi.delete('/me');

// Right of access / portability (Art. 15/20): export the signed-in user's data
// as a single JSON document aggregated across all services.
export const exportData = () => userApi.get('/me/export');

export const sleepApi = axios.create({
    baseURL: '/api/sleep',
    headers: { 'Content-Type': 'application/json' },
});

export const communityApi = axios.create({
    baseURL: '/api/community',
    headers: { 'Content-Type': 'application/json' },
});

export const chatApi = axios.create({
    baseURL: '/api/coaches', // We'll use /api/coaches as the proxy map to chat-service
    headers: { 'Content-Type': 'application/json' },
});

// SSR guard — localStorage and window are only available in the browser
const isBrowser = typeof window !== 'undefined';

// HIGH #1 — token storage model:
//   - REFRESH token: NEVER touches JS. It lives ONLY in the httpOnly `nf_refresh`
//     cookie set by auth-service on login/refresh; the browser replays it on the
//     /api/auth/* calls (withCredentials). An XSS cannot read it.
//   - ACCESS token: short-lived (30m), kept ONLY in this in-memory module
//     variable — NOT in localStorage and NOT persisted by the Zustand store. A
//     full page reload drops it; the response interceptor then silently calls
//     /refresh (which uses the cookie) to mint a fresh one. This removes the
//     persistent-takeover XSS vector (no long-lived secret in JS-readable storage).
let accessTokenInMemory: string | null = null;

// Set the in-memory access token + the non-secret `nf_auth` session-hint cookie
// (read by proxy.ts for route gating only — it carries NO token). The refresh
// token is intentionally NOT handled here: it is owned by the httpOnly cookie.
export const setTokens = (accessToken: string) => {
    accessTokenInMemory = accessToken;
    if (!isBrowser) return;
    // Session hint cookie — client-readable, used by the edge proxy as a "looks
    // logged in" signal only. Real security is server-side JWT validation.
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    document.cookie = `nf_auth=1; path=/; max-age=${maxAge}; SameSite=Strict`;
};

export const clearTokens = () => {
    accessTokenInMemory = null;
    if (!isBrowser) return;
    // Drop any legacy tokens a previous build may have left in localStorage so an
    // upgrade doesn't leave the old XSS-stealable secrets sitting around.
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Clear the session-hint cookie. The httpOnly refresh cookie is cleared
    // server-side by the /logout handler (JS cannot clear an httpOnly cookie).
    document.cookie = 'nf_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';
};

export const getAccessToken = () => accessTokenInMemory;

// Request interceptor to add token
const authInterceptor = (config: any) => {
    const token = getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
};

api.interceptors.request.use(authInterceptor);
shiftApi.interceptors.request.use(authInterceptor);
circadianApi.interceptors.request.use(authInterceptor);
aiApi.interceptors.request.use(authInterceptor);
planApi.interceptors.request.use(authInterceptor);
mealApi.interceptors.request.use(authInterceptor);
progressApi.interceptors.request.use(authInterceptor);
notificationApi.interceptors.request.use(authInterceptor);
userApi.interceptors.request.use(authInterceptor);
subscriptionApi.interceptors.request.use(authInterceptor);
exerciseApi.interceptors.request.use(authInterceptor);
sleepApi.interceptors.request.use(authInterceptor);
communityApi.interceptors.request.use(authInterceptor);
chatApi.interceptors.request.use(authInterceptor);

// Response interceptor for refresh token logic
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    failedQueue = [];
};

const errorInterceptor = async (error: any) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
            return new Promise(function (resolve, reject) {
                failedQueue.push({ resolve, reject });
            })
                .then((token) => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return axios(originalRequest);
                })
                .catch((err) => {
                    return Promise.reject(err);
                });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            // HIGH #1: the refresh token is in the httpOnly nf_refresh cookie, not
            // in JS. Send an empty body with withCredentials so the browser
            // attaches the cookie; auth-service reads it, rotates it, and re-sets
            // the cookie. We only consume the new ACCESS token from the response.
            const response = await axios.post(
                `${AUTH_API_URL}/refresh`,
                {},
                { withCredentials: true }
            );

            const { accessToken: newAccessToken } = response.data;
            setTokens(newAccessToken);

            api.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            shiftApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            circadianApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            aiApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            progressApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            notificationApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            userApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            subscriptionApi.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
            originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;

            processQueue(null, newAccessToken);
            return axios(originalRequest);
        } catch (err) {
            processQueue(err, null);
            clearTokens();
            if (isBrowser) window.location.href = '/login';
            return Promise.reject(err);
        } finally {
            isRefreshing = false;
        }
    }

    return Promise.reject(error);
};

api.interceptors.response.use((response) => response, errorInterceptor);
shiftApi.interceptors.response.use((response) => response, errorInterceptor);
circadianApi.interceptors.response.use((response) => response, errorInterceptor);
aiApi.interceptors.response.use((response) => response, errorInterceptor);
planApi.interceptors.response.use((response) => response, errorInterceptor);
mealApi.interceptors.response.use((response) => response, errorInterceptor);
progressApi.interceptors.response.use((response) => response, errorInterceptor);
notificationApi.interceptors.response.use((response) => response, errorInterceptor);
userApi.interceptors.response.use((response) => response, errorInterceptor);
subscriptionApi.interceptors.response.use((response) => response, errorInterceptor);
exerciseApi.interceptors.response.use((response) => response, errorInterceptor);
sleepApi.interceptors.response.use((response) => response, errorInterceptor);
communityApi.interceptors.response.use((response) => response, errorInterceptor);
chatApi.interceptors.response.use((response) => response, errorInterceptor);
