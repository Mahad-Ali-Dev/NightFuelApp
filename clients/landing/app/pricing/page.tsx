import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { Pricing } from '@/components/sections/Pricing';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, honest Zeitra pricing. Start with a 7-day free trial — the AI coach that runs on your shift, on iOS and Android.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <>
      <Nav active="pricing" />
      <main id="main" className="overflow-x-hidden pt-20 md:pt-24">
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
