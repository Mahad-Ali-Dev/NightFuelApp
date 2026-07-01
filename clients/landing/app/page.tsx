import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import ClientHero from '@/components/site/ClientHero';
import SiteBackground from '@/components/site/SiteBackground';
import { Problem } from '@/components/sections/Problem';
import { FeaturesDetailed } from '@/components/sections/FeaturesDetailed';
import { AppTour } from '@/components/sections/AppTour';
import { DeviceMockups } from '@/components/sections/DeviceMockups';
import { Consistency } from '@/components/sections/Consistency';
import { Science } from '@/components/sections/Science';
import { RiaDemo } from '@/components/sections/RiaDemo';
import { PricingSection } from '@/components/sections/PricingSection';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';

export default function Home() {
  return (
    <>
      {/* subtle, fixed dot field, sits behind everything (fixed inset-0 -z) */}
      <SiteBackground />

      <Nav active="home" />
      <main id="main" className="relative z-10 overflow-x-hidden">
        <ClientHero />
        <Problem />
        <FeaturesDetailed />
        <AppTour />
        <DeviceMockups />
        <Consistency />
        <Science />
        <RiaDemo />
        <PricingSection />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
