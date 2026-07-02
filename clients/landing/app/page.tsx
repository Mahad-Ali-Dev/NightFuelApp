import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { MorphHero } from '@/components/sections/MorphHero';
import { Stats } from '@/components/sections/Stats';
import { FeaturesDetailed } from '@/components/sections/FeaturesDetailed';
import { AppTour } from '@/components/sections/AppTour';
import { DeviceMockups } from '@/components/sections/DeviceMockups';
import { RiaDemo } from '@/components/sections/RiaDemo';
import { Consistency } from '@/components/sections/Consistency';
import { PricingSection } from '@/components/sections/PricingSection';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';

/**
 * Landing v3 — clean, minimal, LIGHT-first.
 *
 * Approved layout:
 *   Hero (scroll-morph of 20 real app screens) → trust Stats strip →
 *   FeaturesDetailed (every feature, grouped) → AppTour (zoom-parallax of real
 *   screens) → DeviceMockups (iOS + Android, real screens) → RiaDemo (chat over
 *   beams) → Consistency (contribution graph) → Pricing (comparison) → FAQ →
 *   FinalCta (waitlist). No heavy 3D site background — minimal and bright.
 */
export default function Home() {
  return (
    <>
      <Nav active="home" />
      <main id="main" className="relative z-10 overflow-x-hidden">
        <MorphHero />
        <Stats />
        <FeaturesDetailed />
        <AppTour />
        <DeviceMockups />
        <RiaDemo />
        <Consistency />
        <PricingSection />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
