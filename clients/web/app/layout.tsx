import type { Metadata } from "next";
import localFont from "next/font/local";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: "Zeitra — Chrono-Nutrition for Shift Workers",
  description: "AI-powered meal timing, caffeine strategy, and workout planning built around your circadian rhythm.",
};

import { InteractiveAICoach } from '@/components/dashboard/InteractiveAICoach';
import Providers from "./providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${barlow.variable} ${barlowCondensed.variable} antialiased bg-background text-foreground min-h-screen selection:bg-brand-500 selection:text-background`}>
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
            <InteractiveAICoach />
          </div>
        </Providers>
      </body>
    </html>
  );
}
