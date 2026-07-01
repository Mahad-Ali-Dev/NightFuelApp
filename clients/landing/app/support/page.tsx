import type { Metadata } from 'next';
import Nav from '@/components/site/Nav';
import Footer from '@/components/site/Footer';
import { SectionShell } from '@/components/ui/section-shell';
import { GradientText } from '@/components/ui/gradient-text';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Zeitra: FAQs, contact, account and subscription help.',
  alternates: { canonical: '/support' },
};

type QA = { q: string; a: React.ReactNode };

const FAQS: QA[] = [
  {
    q: 'When does Zeitra launch?',
    a: (
      <>
        We&apos;re in the final stretch before our iOS and Android launch. Join
        the <a href="/#waitlist">waitlist</a> and we&apos;ll email you the day it
        goes live.
      </>
    ),
  },
  {
    q: 'What makes Zeitra different from MyFitnessPal or Cronometer?',
    a: (
      <>
        Those apps assume a 3-meal, 9-to-5 day. Zeitra is chrono-nutrition: it
        times your meals, caffeine, workouts and sleep to your actual shift.
        It&apos;s built specifically for night and rotating-shift workers.
      </>
    ),
  },
  {
    q: 'Do I need to be online to use it?',
    a: (
      <>
        No. Zeitra ships with a 760-food offline library plus fatigue-aware
        workouts, so it works on the floor, in the cab or anywhere signal is
        patchy. Online, you also get 3M+ branded foods.
      </>
    ),
  },
  {
    q: 'Is there a free version?',
    a: (
      <>
        Yes — Free forever, with full meal and workout logging, basic AI plans
        and a 30-day history. Pro and Premium add unlimited AI plans, weekly
        coach reports and access to certified human coaches.
      </>
    ),
  },
  {
    q: 'How do I manage or cancel a subscription?',
    a: (
      <>
        <strong>iOS:</strong> Apple ID Settings &rarr; Subscriptions.{' '}
        <strong>Android:</strong> Google Play &rarr; Subscriptions.{' '}
        <strong>Web:</strong> Zeitra Settings &rarr; Subscription. Cancellation
        takes effect at the end of the current billing period.
      </>
    ),
  },
  {
    q: 'Is my health data private?',
    a: (
      <>
        Yes. We never sell your data and show no ads. Data is encrypted in
        transit and at rest, and your AI prompts never include your name or
        email. Read the full <a href="/privacy">Privacy Policy</a>.
      </>
    ),
  },
  {
    q: 'Is Zeitra medical advice?',
    a: (
      <>
        No. Zeitra gives general nutrition, exercise and sleep guidance — it is
        not a substitute for professional medical care. If you&apos;re pregnant,
        have a medical condition or take medication, consult a healthcare
        provider first. See our <a href="/terms">Terms</a>.
      </>
    ),
  },
];

const CONTACTS: { title: string; blurb: string; email: string }[] = [
  {
    title: 'General help',
    blurb: 'Questions, feedback, bugs.',
    email: 'hello@zeitra.app',
  },
  {
    title: 'Privacy & your data',
    blurb: 'Access, export or deletion.',
    email: 'privacy@zeitra.app',
  },
  {
    title: 'Billing',
    blurb: 'Subscriptions and refunds.',
    email: 'billing@zeitra.app',
  },
];

export default function SupportPage() {
  return (
    <>
      <Nav active="support" />
      <main id="main" className="overflow-x-hidden pt-24 md:pt-28">
        <SectionShell
          align="left"
          eyebrow="Support"
          title={
            <>
              How can we <GradientText>help?</GradientText>
            </>
          }
          subtitle="Answers to the most common questions. Still stuck? We're one email away."
          decoration={
            <>
              <div
                className="glow"
                aria-hidden="true"
                style={{ width: 520, height: 520, top: '4%', right: '-12%' }}
              />
              <div className="dot-bg" aria-hidden="true" />
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="glass gradient-border group rounded-2xl px-5 py-5 md:px-6 [&_a]:text-[var(--color-lime)] [&_a]:underline [&_a]:underline-offset-2"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-[var(--color-foreground)] transition-colors group-open:text-[var(--color-lime)] md:text-xl">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-muted-foreground)] transition-transform group-open:rotate-45 group-open:border-[var(--color-lime)]/60 group-open:text-[var(--color-lime)]"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-prose leading-relaxed text-[var(--color-muted-foreground)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {CONTACTS.map((c) => (
              <div
                key={c.title}
                className="glass rounded-2xl p-6 transition-colors hover:border-[var(--color-lime)]/40"
              >
                <h3 className="text-base font-semibold text-[var(--color-foreground)]">
                  {c.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {c.blurb}
                </p>
                <a
                  href={`mailto:${c.email}`}
                  className="mt-3 inline-block font-medium text-[var(--color-lime)] underline underline-offset-2"
                >
                  {c.email}
                </a>
              </div>
            ))}
          </div>
        </SectionShell>
      </main>
      <Footer />
    </>
  );
}
