import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Proxy (formerly middleware)
 *
 * Route protection: Redirects unauthenticated users away from protected routes.
 * Uses the `nf_auth` cookie set by lib/api.ts → setTokens() as a session indicator.
 *
 * NOTE: The actual security (JWT validation) is always enforced server-side by
 * each backend microservice. This proxy only prevents unauthenticated page
 * rendering for better UX and an extra layer of protection.
 *
 * Migrated from middleware.ts → proxy.ts per Next.js 16 convention.
 * @see https://nextjs.org/docs/messages/middleware-to-proxy
 */

// ─── Route groups ─────────────────────────────────────────────────────────────
const PROTECTED_PREFIXES = ['/dashboard', '/settings', '/coach'];
const AUTH_ROUTES = ['/login', '/register'];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hasSession = request.cookies.has('nf_auth');

    // Redirect authenticated users away from login/register
    if (hasSession && AUTH_ROUTES.some(p => pathname.startsWith(p))) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Redirect unauthenticated users away from protected routes
    if (!hasSession && PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
        const loginUrl = new URL('/login', request.url);
        // Preserve the intended destination so we can redirect back after login
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    // Run on all routes EXCEPT Next.js internals, static files, and our own API routes
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|fonts/|api/).*)',
    ],
};
