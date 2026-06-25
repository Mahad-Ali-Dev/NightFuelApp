import { CinematicHero } from '@/components/ui/cinematic-landing-hero';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { Stats } from '@/components/sections/Stats';
import { Problem } from '@/components/sections/Problem';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Features } from '@/components/sections/Features';
import { Science } from '@/components/sections/Science';
import { Comparison } from '@/components/sections/Comparison';
import { Personas } from '@/components/sections/Personas';
import { Shifts } from '@/components/sections/Shifts';
import { GuideCta } from '@/components/sections/GuideCta';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { Waitlist } from '@/components/sections/Waitlist';

export default function Home() {
  return (
    <>
      <Nav active="home" />
      <main id="main" className="overflow-x-hidden">
        <CinematicHero
          brandName="Zeitra"
          tagline1="Your body runs on shifts."
          tagline2="So should your fuel."
          cardHeading="Timed to your real rota."
          cardDescription={
            <>
              Zeitra syncs meals, training, caffeine and sleep to when you
              <span className="text-white font-semibold"> actually work</span> —
              built for the 1.8 billion shift workers the 9-to-5 apps forget.
            </>
          }
          metricValue={365}
          metricLabel="Nights handled"
          ctaHeading="Be first through the door."
          ctaDescription="Join the waitlist and we'll set you up the moment Zeitra hits your store."
        />
        <Stats />
        <Problem />
        <HowItWorks />
        <Features />
        <Science />
        <Comparison />
        <Personas />
        <Shifts />
        <GuideCta />
        <Pricing />
        <Faq />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
