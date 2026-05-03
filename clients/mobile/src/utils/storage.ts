/**
 * SecureStore helpers.
 * Typed wrappers around expo-secure-store for token management.
 */
import * as SecureStore from 'expo-secure-store';

// ── Storage Keys ────────────────────────────────────────────────────

export const STORAGE_KEYS = {
    ACCESS_TOKEN: 'nf_access_token',
    REFRESH_TOKEN: 'nf_refresh_token',
    USER_ID: 'nf_user_id',
    ONBOARDING_COMPLETE: 'nf_onboarding_complete',
    DEVICE_TOKEN: 'nf_device_token',
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// ── Typed Getters / Setters ─────────────────────────────────────────

export async function getSecure(key: StorageKey): Promise<string | null> {
    return SecureStore.getItemAsync(key);
}

export async function setSecure(key: StorageKey, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
}

export async function deleteSecure(key: StorageKey): Promise<void> {
    await SecureStore.deleteItemAsync(key);
}

// ── Token Helpers ───────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
    return getSecure(STORAGE_KEYS.ACCESS_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
    return getSecure(STORAGE_KEYS.REFRESH_TOKEN);
}

export async function setTokens(
    accessToken: string,
    refreshToken: string,
): Promise<void> {
    await Promise.all([
        setSecure(STORAGE_KEYS.ACCESS_TOKEN, accessToken),
        setSecure(STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
}

export async function clearTokens(): Promise<void> {
    await Promise.all([
        deleteSecure(STORAGE_KEYS.ACCESS_TOKEN),
        deleteSecure(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
}

export async function isOnboardingComplete(): Promise<boolean> {
    const val = await getSecure(STORAGE_KEYS.ONBOARDING_COMPLETE);
    return val === 'true';
}

export async function markOnboardingComplete(): Promise<void> {
    await setSecure(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
}
