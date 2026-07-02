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
export default function Home() {
  return (
    <>
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
