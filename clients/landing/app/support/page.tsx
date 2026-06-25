import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { Reveal } from '@/components/sections/Reveal';

export const metadata: Metadata = {
  title: 'Support — Zeitra',
  description:
    'Get help with Zeitra: FAQs, contact, account and subscription help.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <>
      <Nav active="support" />
      <main id="main">
        <section className="main-prose">
          <div className="container">
            <Reveal
              className="section-head"
              style={{ textAlign: 'left', marginBottom: 36 }}
            >
              <span className="eyebrow">Support</span>
              <h2 style={{ marginBottom: 10 }}>How can we help?</h2>
              <p>
                Answers to the most common questions. Still stuck? We&apos;re one
                email away.
              </p>
            </Reveal>

            <Reveal className="faq">
              <details className="glass">
                <summary>When does Zeitra launch?</summary>
                <p>
                  We&apos;re in the final stretch before our iOS and Android
                  launch. Join the <a href="/#waitlist">waitlist</a> and
                  we&apos;ll email you the day it goes live.
                </p>
              </details>
              <details className="glass">
                <summary>
                  What makes Zeitra different from MyFitnessPal or Cronometer?
                </summary>
                <p>
                  Those apps assume a 3-meal, 9-to-5 day. Zeitra is
                  chrono-nutrition: it times your meals, caffeine, workouts and
                  sleep to your actual shift. It&apos;s built specifically for
                  night and rotating-shift workers.
                </p>
              </details>
              <details className="glass">
                <summary>Do I need to be online to use it?</summary>
                <p>
                  No. Zeitra ships with a 760-food offline library plus
                  fatigue-aware workouts, so it works on the floor, in the cab or
                  anywhere signal is patchy. Online, you also get 3M+ branded
                  foods.
                </p>
              </details>
              <details className="glass">
                <summary>Is there a free version?</summary>
                <p>
                  Yes — Free forever, with full meal and workout logging, basic
                  AI plans and a 30-day history. Pro and Premium add unlimited AI
                  plans, weekly coach reports and access to certified human
                  coaches.
                </p>
              </details>
              <details className="glass">
                <summary>How do I manage or cancel a subscription?</summary>
                <p>
                  <strong>iOS:</strong> Apple ID Settings → Subscriptions.{' '}
                  <strong>Android:</strong> Google Play → Subscriptions.{' '}
                  <strong>Web:</strong> Zeitra Settings → Subscription.
                  Cancellation takes effect at the end of the current billing
                  period.
                </p>
              </details>
              <details className="glass">
                <summary>Is my health data private?</summary>
                <p>
                  Yes. We never sell your data and show no ads. Data is encrypted
                  in transit and at rest, and your AI prompts never include your
                  name or email. Read the full{' '}
                  <a href="/privacy">Privacy Policy</a>.
                </p>
              </details>
              <details className="glass">
                <summary>Is Zeitra medical advice?</summary>
                <p>
                  No. Zeitra gives general nutrition, exercise and sleep guidance
                  — it is not a substitute for professional medical care. If
                  you&apos;re pregnant, have a medical condition or take
                  medication, consult a healthcare provider first. See our{' '}
                  <a href="/terms">Terms</a>.
                </p>
              </details>
            </Reveal>

            <div className="contact-cards">
              <Reveal className="contact-card glass">
                <h3>General help</h3>
                <p>Questions, feedback, bugs.</p>
                <a href="mailto:hello@zeitra.app">hello@zeitra.app</a>
              </Reveal>
              <Reveal className="contact-card glass">
                <h3>Privacy &amp; your data</h3>
                <p>Access, export or deletion.</p>
                <a href="mailto:privacy@zeitra.app">privacy@zeitra.app</a>
              </Reveal>
              <Reveal className="contact-card glass">
                <h3>Billing</h3>
                <p>Subscriptions and refunds.</p>
                <a href="mailto:billing@zeitra.app">billing@zeitra.app</a>
              </Reveal>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
