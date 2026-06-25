import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { renderLegal } from '@/components/site/legal';

export const metadata: Metadata = {
  title: 'Terms of Service — Zeitra',
  description: 'The terms that govern your use of Zeitra.',
  alternates: { canonical: '/terms' },
};

// Read + convert the canonical terms markdown at build time (static export).
const html = renderLegal('terms.md');

export default function TermsPage() {
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
