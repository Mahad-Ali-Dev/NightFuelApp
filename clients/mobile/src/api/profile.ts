import { apiClient } from './client';
import { uploadImage } from './community';
import { User } from '@/store/authStore';
import type { BirthControlMethod } from './cycle';

export interface UserProfile extends User {
    // The user-service profile row carries displayName/avatarUrl/timezone (see
    // services/user-service/prisma/schema.prisma → model UserProfile). There is
    // NO aboutMe/occupation column on that row — the editor used to send them and
    // falsely claim they saved, so they are intentionally absent here.
    timezone?: string;
    avatarUrl: string | null;
    preferences?: UserPreferences;
    status?: UserStatus;

    // ── Cycle health: pregnancy mode + birth-control / pill tracking (Period P2)
    // The owner read (GET /v1/users/me) returns the FULL profile row, so these
    // already come down the wire — they are declared here so the cycle UI can read
    // the persisted state (initial toggle/method/reminder values). All are OPT-IN,
    // written via PATCH /v1/users/me/cycle/health (see api/cycle.ts). Nullable /
    // optional throughout: absent = the user never turned that surface on.
    pregnancyMode?: boolean;
    pregnancyDueDate?: string | null;      // YYYY-MM-DD
    pregnancyStartDate?: string | null;    // YYYY-MM-DD
    tryingToConceive?: boolean;
    birthControlMethod?: BirthControlMethod | null;
    pillReminderEnabled?: boolean;
    pillReminderTime?: string | null;      // 'HH:MM' (24h)
    pillPackStartDate?: string | null;     // YYYY-MM-DD
}

// Shape PUT /v1/users/me actually accepts (server: updateProfileSchema in
// services/user-service/src/schemas.ts). Deliberately decoupled from the GET
// response (UserProfile, whose `name` is the authStore mirror of the server's
// `displayName`): the server reads `displayName`, so the editor must send that
// key — sending `name` silently no-ops.
export interface UpdateProfileInput {
    displayName?: string;
    avatarUrl?: string | null;
    dateOfBirth?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    biologicalSex?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
    timezone?: string;
    region?: 'us' | 'eu' | 'ap';
    // ── Menstrual-cycle tracking (F25; persisted via the EXISTING PUT
    // /v1/users/me / updateProfileSchema). All fields are OPT-IN — the backend
    // gates them on cycleTrackingEnabled, so the client may send them regardless
    // and the server ignores the period inputs when tracking is off. Data
    // minimization: ONLY these fields exist (no sexual-activity / pregnancy data).
    cycleTrackingEnabled?: boolean;
    lastPeriodStartDate?: string | null; // YYYY-MM-DD, same format as dateOfBirth
    avgCycleLengthDays?: number | null;  // 21-45, default 28
    avgPeriodLengthDays?: number | null; // 1-10, default 5
    cycleRegularity?: 'REGULAR' | 'IRREGULAR' | 'UNKNOWN' | null;
    hormonalContraception?: boolean;
}

// Mirrors the columns GET /v1/users/me/preferences actually returns
// (services/user-service/prisma/schema.prisma → model UserPreferences). Fields
// the client used to read but that have NO backing column — dietaryType (server:
// dietaryPreference), wakeTime/sleepTime/workStartTime/workEndTime (server:
// sleepWindowStart/sleepWindowEnd only), sleepTargetHours, and
// dislikedIngredients/medications/supplements — were removed so the screen can't
// claim to persist something the server drops.
export interface UserPreferences {
    dietaryPreference: string;
    sleepWindowStart: string | null;
    sleepWindowEnd: string | null;
    allergies: string[];
    healthConditions: string[];
}

export interface UserStatus {
    fatigueScore: number;
    adherenceScore: number;
    // Optional: no service currently returns a circadian phase on the status
    // row (the user-service status carries circadianPeakTime/circadianLowTime,
    // not a phase). Leave it undefined when absent so the UI's honest-empty
    // fallback ('—') renders instead of a fabricated 'WAKE' for everyone.
    circadianPhase?: 'WAKE' | 'SLEEP' | 'WIND_DOWN';
    // Derived menstrual-cycle phase from GET /v1/users/me/status (F25). Mirrors
    // the circadianPhase slot above: optional, passed through only when the
    // backend actually returns it. 'UNKNOWN' is an HONEST state — "not enough
    // info / tracking off" — and must render a tracking-only UI, never a fake
    // phase. The science is an estimate, not medical advice.
    cyclePhase?: 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL' | 'UNKNOWN';
    lastUpdated: string;
}

export const getMyProfile = async (): Promise<UserProfile> => {
    const { data } = await apiClient.get('/v1/users/me');
    return data;
};

export const updateProfile = async (updates: UpdateProfileInput): Promise<UserProfile> => {
    // If the caller passes a freshly-picked LOCAL avatar (a file://… / content://…
    // ImagePicker URI), upload it to the image host FIRST and persist the returned
    // https URL. Storing the raw device path means the avatar only renders on the
    // authoring device and is blank for everyone else — the exact bug that made
    // community posts show "no avatar" for other users. Mirrors createPost's image
    // fix. An already-https avatarUrl (or null/empty) passes straight through.
    let body = updates;
    if (updates.avatarUrl && !/^https:\/\//i.test(updates.avatarUrl)) {
        const uploadedUrl = await uploadImage(updates.avatarUrl);
        body = { ...updates, avatarUrl: uploadedUrl };
    }
    const { data } = await apiClient.put('/v1/users/me', body);
    return data;
};

export const getPreferences = async (): Promise<UserPreferences> => {
    const { data } = await apiClient.get('/v1/users/me/preferences');
    return data;
};

export const updatePreferences = async (updates: Partial<UserPreferences>): Promise<UserPreferences> => {
    const { data } = await apiClient.put('/v1/users/me/preferences', updates);
    return data;
};

export const getStatus = async (): Promise<UserStatus> => {
    // Backend uses adherenceRate / circadianPeakTime / updatedAt
    const { data } = await apiClient.get<any>('/v1/users/me/status');
    return {
        fatigueScore: data.fatigueScore ?? 0,
        adherenceScore: data.adherenceScore ?? data.adherenceRate ?? 0,
        // Pass through only when the backend actually provides a phase. Do NOT
        // fabricate 'WAKE' — no service returns this field, so the old default
        // hard-stuck the Profile "CIRCADIAN PHASE" card on 'WAKE' for everyone.
        // Left undefined, profile.tsx's `?? '—'` honest-empty fallback renders.
        circadianPhase: data.circadianPhase,
        // Pass through only when the backend provides a cycle phase. Absent =>
        // undefined, so the opt-in-aware UI hides entirely (the user never
        // enabled tracking). 'UNKNOWN' is a real value the backend returns when
        // tracking is on but there is not enough info / data is irregular / on
        // hormonal contraception — the UI renders an honest tracking-only state.
        cyclePhase: data.cyclePhase,
        lastUpdated: data.lastUpdated ?? data.updatedAt ?? '',
    };
};

export const getPublicProfile = async (userId: string): Promise<Partial<UserProfile>> => {
    const { data } = await apiClient.get(`/v1/users/public/${userId}`);
    return data;
};
