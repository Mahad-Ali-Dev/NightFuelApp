/** @type {import('next').NextConfig} */

// ─── Security Headers ──────────────────────────────────────────────────────────
const securityHeaders = [
    // Prevent the page from being embedded in an iframe (clickjacking protection)
    { key: 'X-Frame-Options', value: 'DENY' },
    // Prevent MIME-type sniffing
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Control referrer information
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Disable dangerous browser features
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=()',
    },
    // Legacy XSS protection for older browsers
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    // Force HTTPS in production — DISABLED for local dev
    // {
    //     key: 'Strict-Transport-Security',
    //     value: 'max-age=63072000; includeSubDomains; preload',
    // },
    // Content Security Policy — restrict resource origins
    {
        key: 'Content-Security-Policy',
        value: [
            "default-src 'self'",
            // Scripts: self + Next.js inline scripts
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            // Styles: self + inline (Tailwind generates inline styles)
            "style-src 'self' 'unsafe-inline'",
            // Images: self + allowed CDNs (exercise images, food images)
            [
                "img-src 'self' data: blob:",
                'https://images.openfoodfacts.org',
                'https://static.openfoodfacts.org',
                'https://raw.githubusercontent.com',
                'https://v2.exercisedb.io',
                'https://exercisedb.io',
            ].join(' '),
            // Fonts: self
            "font-src 'self'",
            // Connect: self + backend services + external APIs
            [
                "connect-src 'self'",
                'https://world.openfoodfacts.org',
                'https://us.openfoodfacts.org',
                'https://pk.openfoodfacts.org',
                'https://in.openfoodfacts.org',
                'https://uk.openfoodfacts.org',
                'https://ae.openfoodfacts.org',
                'https://eg.openfoodfacts.org',
                'https://tr.openfoodfacts.org',
                'https://raw.githubusercontent.com',
                'ws://localhost:*',  // Dev: WebSocket hot reload
            ].join(' '),
            "media-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            // "upgrade-insecure-requests", // DISABLED for local dev
        ].join('; '),
    },
];

const nextConfig = {
    // ─── Disable Turbopack — use stable Webpack instead ───────────────────────
    // Turbopack causes a fatal 'Access is denied' (os error 5) panic on Windows
    // which kills the web client process daily. Webpack is stable on all platforms.
    experimental: {
        turbo: {
            enabled: false,
        },
    },

    // ─── Standalone output for Docker (copies only required files) ────────────
    output: 'standalone',

    // ─── External image domains ───────────────────────────────────────────────
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'v2.exercisedb.io',
                pathname: '/image/**',
            },
            {
                protocol: 'https',
                hostname: 'exercisedb.io',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'images.openfoodfacts.org',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'static.openfoodfacts.org',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'raw.githubusercontent.com',
                pathname: '/yuhonas/**',
            },
        ],
        // Allow unoptimized GIFs (Next.js doesn't optimize animated GIFs by default)
        unoptimized: true,
    },

    // ─── Security Headers ─────────────────────────────────────────────────────
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: securityHeaders,
            },
        ];
    },

    // ─── API Proxy Rewrites ───────────────────────────────────────────────────
    async rewrites() {
        return [
            // ── Backend microservices ────────────────────────────────────────
            {
                source: '/api/auth/:path*',
                destination: 'http://127.0.0.1:3001/v1/auth/:path*',
            },
            {
                source: '/api/shifts/:path*',
                destination: 'http://127.0.0.1:3002/v1/shifts/:path*',
            },
            {
                source: '/api/circadian/:path*',
                destination: 'http://127.0.0.1:3003/v1/circadian/:path*',
            },
            {
                source: '/api/ai/:path*',
                destination: 'http://127.0.0.1:3004/v1/ai/:path*',
            },
            {
                source: '/api/plans/:path*',
                destination: 'http://127.0.0.1:3005/v1/plans/:path*',
            },
            {
                source: '/api/meals/:path*',
                destination: 'http://127.0.0.1:3006/v1/meals/:path*',
            },
            {
                source: '/api/progress/:path*',
                destination: 'http://127.0.0.1:3007/v1/progress/:path*',
            },
            {
                source: '/api/notifications/:path*',
                destination: 'http://127.0.0.1:3008/v1/notifications/:path*',
            },
            {
                source: '/api/users/:path*',
                destination: 'http://127.0.0.1:3009/v1/users/:path*',
            },
            {
                source: '/api/subscriptions/:path*',
                destination: 'http://127.0.0.1:3010/v1/subscriptions/:path*',
            },
            {
                source: '/api/exercises/:path*',
                destination: 'http://127.0.0.1:3011/v1/exercises/:path*',
            },
            {
                source: '/api/sleep/:path*',
                destination: 'http://127.0.0.1:3012/v1/sleep/:path*',
            },
            {
                source: '/api/community/:path*',
                destination: 'http://127.0.0.1:3013/v1/community/:path*',
            },
            {
                source: '/api/coaches/:path*',
                destination: 'http://127.0.0.1:3014/v1/coaches/:path*',
            },
            {
                source: '/api/chat/:path*',
                destination: 'http://127.0.0.1:3014/v1/chat/:path*',
            },
            {
                source: '/api/state/:path*',
                destination: 'http://127.0.0.1:3015/v1/state/:path*',
            },
            {
                source: '/api/decision/:path*',
                destination: 'http://127.0.0.1:3016/v1/decision/:path*',
            },
        ];
    },
};

export default nextConfig;
