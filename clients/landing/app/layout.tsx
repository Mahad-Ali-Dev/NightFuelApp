import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE = 'https://zeitra.app';

export const viewport: Viewport = {
  themeColor: '#0a0c12',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Zeitra — Meals, Workouts & Sleep on Your Shift, Not a 9-to-5',
  description:
    'Zeitra is chrono-nutrition, training and sleep optimization for shift workers. It times your meals, workouts, caffeine and sleep to your real schedule. Coming soon to iOS and Android.',
  icons: { icon: '/assets/favicon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'Zeitra',
    title: 'Zeitra — Meals, Workouts & Sleep on Your Shift',
    description: 'Chrono-nutrition, training and sleep for the 1.8 billion people who work while the world sleeps.',
    url: SITE,
    images: ['/assets/og.svg'],
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        {children}
      </body>
    </html>
  );
}
