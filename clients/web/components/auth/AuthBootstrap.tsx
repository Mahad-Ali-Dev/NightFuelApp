'use client';

import { useEffect, useRef } from 'react';
import { api, setTokens, getAccessToken, clearTokens } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

/**
 * HIGH #1 session rehydration.
 *
 * The access token is now kept ONLY in memory (never localStorage), so a full
 * page reload starts with no access token even though the user may still have a
 * valid session (the httpOnly nf_refresh cookie survives the reload). Without
 * this, every reload would look logged-out until the first 401 triggered a lazy
 * refresh — breaking `enabled: isAuthenticated` gated queries on first paint.
 *
 * On mount, if the non-secret `nf_auth` session-hint cookie is present and we
 * have no in-memory access token yet, we proactively call /refresh (which uses
 * the httpOnly cookie, not a JS-held token) to mint a fresh access token and
 * mark the store authenticated — restoring the prior reload behaviour without
 * persisting any secret in JS-readable storage. If the refresh fails (cookie
 * expired/revoked), we clear the stale session-hint cookie so the proxy stops
 * treating the user as logged in.
 */
export default function AuthBootstrap() {
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        // Already have an in-memory access token (e.g. just logged in this SPA
        // session) — nothing to restore.
        if (getAccessToken()) return;

        // Only attempt a refresh when the session-hint cookie says we were logged
        // in; otherwise a logged-out visitor would needlessly hit /refresh.
        const hasSessionHint = document.cookie
            .split(';')
            .some((c) => c.trim().startsWith('nf_auth='));
        if (!hasSessionHint) return;

        let cancelled = false;
        (async () => {
            try {
                // Empty body — the refresh token rides in the httpOnly cookie
                // (api has withCredentials:true).
                const res = await api.post('/refresh', {});
                if (cancelled) return;
                const accessToken = res.data?.accessToken;
                if (!accessToken) throw new Error('No access token in refresh response');
                setTokens(accessToken);
                useAuthStore.setState({ token: accessToken, isAuthenticated: true });
            } catch {
                if (cancelled) return;
                // Cookie expired/revoked — drop the stale hint so the user is
                // treated as logged out and re-prompted to sign in.
                clearTokens();
                useAuthStore.setState({ token: null, isAuthenticated: false });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
