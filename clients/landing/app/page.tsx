import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { Hero } from '@/components/sections/Hero';
import { Stats } from '@/components/sections/Stats';
import { Problem } from '@/components/sections/Problem';
import { Features } from '@/components/sections/Features';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Science } from '@/components/sections/Science';
import { Comparison } from '@/components/sections/Comparison';
import { Personas } from '@/components/sections/Personas';
import { Testimonials } from '@/components/sections/Testimonials';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';

export default function Home() {
  return (
    <>
      <Nav active="home" />
      <main id="main" className="overflow-x-hidden">
        <Hero />
        <Stats />
        <Problem />
        <Features />
        <HowItWorks />
        <Science />
        <Comparison />
        <Personas />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
