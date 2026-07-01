import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { renderLegal } from '@/components/site/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Zeitra.',
  alternates: { canonical: '/terms' },
};

// Read + convert the canonical terms markdown at build time (static export).
const html = renderLegal('terms.md');

export default function TermsPage() {
  return (
    <>
      <Nav active="terms" />
      <main id="main" className="overflow-x-hidden pt-24 md:pt-28">
        <SectionShell
          align="left"
          eyebrow="Legal"
          title={
            <>
              Terms of <GradientText>Service</GradientText>
            </>
          }
          subtitle="The terms that govern your use of Zeitra."
          containerClassName="!max-w-[820px]"
        >
          <article
            className="legal-prose"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </SectionShell>
      </main>
      <Footer />
    </>
  );
}
