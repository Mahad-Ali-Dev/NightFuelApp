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
  url: '/og.svg',
  width: 1200,
  height: 630,
  alt: 'Zeitra — nutrition & fitness that runs on your clock',
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
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
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
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
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
