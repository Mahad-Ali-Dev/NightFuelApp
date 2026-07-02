import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { MorphHero } from '@/components/sections/MorphHero';
import { Stats } from '@/components/sections/Stats';
import { Problem } from '@/components/sections/Problem';
import { Personas } from '@/components/sections/Personas';
import { FeaturesDetailed } from '@/components/sections/FeaturesDetailed';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { FeatureShowcase } from '@/components/sections/FeatureShowcase';
import { DeviceMockups } from '@/components/sections/DeviceMockups';
import { Science } from '@/components/sections/Science';
import { RiaDemo } from '@/components/sections/RiaDemo';
import { Testimonials } from '@/components/sections/Testimonials';
import { Consistency } from '@/components/sections/Consistency';
import { PricingSection } from '@/components/sections/PricingSection';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';

/**
 * Landing v3.1 — clean, minimal, LIGHT-first, full narrative arc:
 *
 *   Hero (headline block + orbit of 20 real app screens below it) →
 *   Stats (trust strip) → Problem (the gap) → FeaturesDetailed (every
 *   feature) → HowItWorks (3 steps) → AppTour (zoom-parallax of real
 *   screens) → DeviceMockups (iOS + Android) → Science (chrono credibility) →
 *   RiaDemo (chat) → Testimonials → Consistency (streak graph) → Pricing →
 *   FAQ → FinalCta (waitlist).
 */
/* FAQPage structured data — mirrors the on-page FAQ so Google can show rich
   results. Keep in sync with components/sections/Faq.tsx. */
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Does it really adapt to MY shift pattern?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You tell Zeitra your real rota — nights, rotating, split or on-call — and it times meals, caffeine, training and wind-down around those hours. Change your shifts and the plan re-times itself.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which wearables work with Zeitra?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Apple Health on iOS, Health Connect on Android, and any Bluetooth heart-rate wearable — including unbranded watches and bands — via direct Bluetooth pairing in the app.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Zeitra on iOS and Android?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — Zeitra ships natively on both iOS and Android, with the same features on each.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my health data private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Your data is never sold, cycle data is treated as sensitive and consent-based, traffic is encrypted, and you can export or delete everything in-app from Settings → Privacy & Data.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Start with a 7-day free trial; cancel anytime through the App Store or Google Play and you keep access until the end of the billing period.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a human coach?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No — Ria, the built-in AI coach, plans and adapts everything. If you want a human, Zeitra also has a marketplace of verified coaches you can chat with inside the app.',
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      <Nav active="home" />
      <main id="main" className="relative z-10 overflow-x-hidden">
        <MorphHero />
        <Stats />
        <Problem />
        <Personas />
        <FeaturesDetailed />
        <HowItWorks />
        <FeatureShowcase />
        <DeviceMockups />
        <Science />
        <RiaDemo />
        <Testimonials />
        <Consistency />
        <PricingSection />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
