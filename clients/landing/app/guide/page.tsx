import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { GuideBody } from './GuideBody';

export const metadata: Metadata = {
  title: 'User Guide — How to Use Zeitra',
  description:
    'The complete Zeitra guide: set your shift, read your daily fuel plan, log meals, time caffeine, train around fatigue, optimize sleep, and work with Ria, your AI coach.',
  alternates: { canonical: '/guide' },
};

export default function GuidePage() {
  return (
    <>
      <Nav active="guide" />
      <main id="main">
        <section className="guide-hero">
          <div className="container">
            <span className="eyebrow">User guide</span>
            <h1>
              How to use <span className="grad">Zeitra</span>
            </h1>
            <p>
              Everything you need to eat, train and sleep on your shift — from
              your first night to your first month. Pick a section, or read it
              start to finish.
            </p>
          </div>
        </section>

        <div className="container">
          <GuideBody />
        </div>
      </main>
      <Footer />
    </>
  );
}
