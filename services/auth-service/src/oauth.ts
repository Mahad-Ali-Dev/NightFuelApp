/**
 * Social sign-in identity-token verification (Google + Apple).
 *
 * These helpers ONLY verify a provider token and return a normalized identity
 * ({ sub, email, emailVerified, name }). Find-or-create/link logic lives in
 * AuthService — this module is provider-crypto only, so it stays testable and
 * has no DB/event dependencies.
 *
 * GRACEFUL DEGRADATION: when a provider's credentials are absent (they will be
 * initially), the corresponding verifier throws `OAuthNotConfiguredError`, which
 * the route maps to a clean 503-style "not configured" response — never a crash.
 * A token that IS present but fails verification throws a plain Error whose
 * message is the allowlisted generic "Invalid <provider> token".
 */

import { OAuth2Client } from 'google-auth-library';
// apple-signin-auth verifies the Apple identity token against Apple's JWKS
// (https://appleid.apple.com/auth/keys), checking signature, expiry, issuer and
// audience. It has no bundled types, so it's imported via require-style default.
import appleSignin from 'apple-signin-auth';

/** Thrown when a provider's credentials are not configured (missing env). The
 *  route turns this into a 503 "<Provider> sign-in is not configured". */
export class OAuthNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OAuthNotConfiguredError';
    }
}

/** Normalized identity extracted from a verified provider token. */
export interface OAuthIdentity {
    /** Provider's stable subject id (Google/Apple `sub`) — the link key. */
    sub: string;
    /** Verified email, when the provider released one (Apple: first sign-in only). */
    email: string | null;
    /** Whether the provider asserts the email is verified. */
    emailVerified: boolean;
    /** Best-effort display name from the provider (may be null). */
    name: string | null;
}

// Apple's fixed issuer + default audience (the app's bundle id). The audience is
// overridable via APPLE_CLIENT_ID for other bundle/service ids.
const APPLE_ISSUER = 'https://appleid.apple.com';
const DEFAULT_APPLE_CLIENT_ID = 'com.zeitra.app';

/** Parse the comma-separated GOOGLE_CLIENT_IDS env into a trimmed, non-empty set. */
function googleClientIds(): string[] {
    return (process.env.GOOGLE_CLIENT_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function appleClientId(): string {
    return (process.env.APPLE_CLIENT_ID || DEFAULT_APPLE_CLIENT_ID).trim();
}

/** True when Google sign-in is configured (at least one client id present). */
export function isGoogleConfigured(): boolean {
    return googleClientIds().length > 0;
}

/**
 * Apple is considered configured as long as we have an audience to verify
 * against. APPLE_CLIENT_ID defaults to the bundle id, so Apple verification can
 * run out of the box; there is no client secret needed for identity-token
 * verification (Apple's public JWKS is fetched over the wire).
 */
export function isAppleConfigured(): boolean {
    return appleClientId().length > 0;
}

// Reuse a single OAuth2Client (it lazily fetches + caches Google's certs).
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
    if (!googleClient) googleClient = new OAuth2Client();
    return googleClient;
}

/**
 * Verify a Google ID token and return a normalized identity.
 *
 * SECURITY: audience MUST be one of the configured GOOGLE_CLIENT_IDS, the token
 * signature/expiry are checked by verifyIdToken, and email_verified MUST be true
 * with a present email — otherwise we reject. Rejects with the generic
 * 'Invalid Google token' (no detail leaked); missing config throws
 * OAuthNotConfiguredError.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
    const audience = googleClientIds();
    if (audience.length === 0) {
        throw new OAuthNotConfiguredError('Google sign-in is not configured');
    }

    let payload;
    try {
        const ticket = await getGoogleClient().verifyIdToken({ idToken, audience });
        payload = ticket.getPayload();
    } catch {
        // Signature/expiry/audience failure — do not leak the underlying reason.
        throw new Error('Invalid Google token');
    }

    if (!payload || !payload.sub) {
        throw new Error('Invalid Google token');
    }
    // Require a provider-verified email — a non-verified email must not be able
    // to auto-link to (or masquerade as) an existing local account.
    if (payload.email_verified !== true || !payload.email) {
        throw new Error('Invalid Google token');
    }

    return {
        sub: payload.sub,
        email: payload.email.trim().toLowerCase(),
        emailVerified: true,
        name: payload.name || null,
    };
}

/**
 * Verify an Apple identity token against Apple's JWKS and return a normalized
 * identity.
 *
 * SECURITY: audience = APPLE_CLIENT_ID (default bundle id), issuer =
 * https://appleid.apple.com, signature/expiry verified via Apple's public keys.
 * Apple only returns email on the FIRST authorization, so `email` may be null on
 * repeat sign-ins — the caller falls back to (provider, sub) lookup. `sub` is
 * the stable id and is always present. Rejects with the generic
 * 'Invalid Apple token'.
 */
export async function verifyAppleIdentityToken(identityToken: string): Promise<OAuthIdentity> {
    const audience = appleClientId();
    if (!audience) {
        throw new OAuthNotConfiguredError('Apple sign-in is not configured');
    }

    let claims: any;
    try {
        claims = await appleSignin.verifyIdToken(identityToken, {
            audience,
            // Small leeway for clock skew, matching common defaults.
            ignoreExpiration: false,
        });
    } catch {
        throw new Error('Invalid Apple token');
    }

    // Defence in depth: apple-signin-auth already enforces audience, but the
    // issuer check is asserted here explicitly so a token minted for a different
    // issuer can never slip through.
    if (!claims || !claims.sub || claims.iss !== APPLE_ISSUER) {
        throw new Error('Invalid Apple token');
    }

    const email =
        typeof claims.email === 'string' && claims.email.length > 0
            ? claims.email.trim().toLowerCase()
            : null;
    // Apple returns email_verified as a boolean OR the string "true".
    const emailVerified =
        claims.email_verified === true || claims.email_verified === 'true';

    return {
        sub: claims.sub,
        email,
        emailVerified,
        name: null,
    };
}
