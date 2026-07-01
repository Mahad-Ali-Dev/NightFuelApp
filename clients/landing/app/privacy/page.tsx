import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';
import { renderLegal } from '@/components/site/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Zeitra collects, uses and protects your personal and health data.',
  alternates: { canonical: '/privacy' },
};

// Read + convert the canonical privacy markdown at build time (static export).
const html = renderLegal('privacy.md');

export default function PrivacyPage() {
  return (
    <>
      <Nav active="privacy" />
      <main id="main" className="overflow-x-hidden pt-24 md:pt-28">
        <SectionShell
          align="left"
          eyebrow="Legal"
          title={
            <>
              Privacy <GradientText>Policy</GradientText>
            </>
          }
          subtitle="How Zeitra collects, uses and protects your personal and health data."
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
