import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { renderLegal } from '@/components/site/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — Zeitra',
  description:
    'How Zeitra collects, uses and protects your personal and health data.',
  alternates: { canonical: '/privacy' },
};

// Read + convert the canonical privacy markdown at build time (static export).
const html = renderLegal('privacy.md');

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="main" className="main-prose">
        <article
          className="prose container"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
      <Footer />
    </>
  );
}
