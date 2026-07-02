import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const SITE = 'https://zeitra.app';

/* Body — Barlow. Display / headings — Barlow Condensed. Exposed as CSS vars
   so the @theme font tokens (--font-barlow / --font-barlow-condensed) resolve. */
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0c12' },
    { media: '(prefers-color-scheme: light)', color: '#f6f8f4' },
  ],
  colorScheme: 'light dark',
};

const TITLE = 'Zeitra — Chrono-nutrition & fitness for shift workers';
const DESCRIPTION =
  'Zeitra is the AI coach that times your meals, training, caffeine and sleep to when you actually work — built for the 1.8 billion shift workers the 9-to-5 apps forget.';
const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Zeitra — nutrition & fitness that runs on your clock',
};

/* JSON-LD structured data — Organization + WebSite + the mobile app itself.
   Emitted once, site-wide, for Google rich results / knowledge panel. */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: 'Zeitra',
      legalName: 'Tase LLC',
      url: SITE,
      logo: `${SITE}/icon-192.png`,
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'support@zeitra.app',
        contactType: 'customer support',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: SITE,
      name: 'Zeitra',
      publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@type': 'MobileApplication',
      '@id': `${SITE}/#app`,
      name: 'Zeitra',
      operatingSystem: 'iOS, Android',
      applicationCategory: 'HealthApplication',
      description: DESCRIPTION,
      url: SITE,
      image: `${SITE}/og.png`,
      publisher: { '@id': `${SITE}/#org` },
      offers: [
        {
          '@type': 'Offer',
          name: 'Zeitra Pro — Monthly',
          price: '9.99',
          priceCurrency: 'USD',
          category: 'subscription',
        },
        {
          '@type': 'Offer',
          name: 'Zeitra Pro — Annual',
          price: '59',
          priceCurrency: 'USD',
          category: 'subscription',
        },
      ],
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: TITLE,
    template: '%s | Zeitra',
  },
  description: DESCRIPTION,
  applicationName: 'Zeitra',
  category: 'health',
  alternates: { canonical: '/' },
  keywords: [
    'shift worker nutrition',
    'chrono-nutrition',
    'circadian nutrition',
    'AI fitness coach',
    'meal timing',
    'night shift diet',
    'rotating shift health',
    'caffeine timing',
    'sleep optimization',
    'wearable sync',
    'MyFitnessPal alternative',
  ],
  authors: [{ name: 'Zeitra' }],
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '48x48' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Zeitra',
    title: TITLE,
    description:
      'The AI coach that times your meals, training, caffeine and sleep to your real shift pattern. Built for the people 9-to-5 apps forget.',
    url: SITE,
    locale: 'en_US',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description:
      'The AI coach that times your meals, training and sleep to your real shift pattern.',
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script
          type="application/ld+json"
          // Static, build-time structured data — no user input flows in.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
