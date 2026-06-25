'use client';

import { Reveal } from './Reveal';

/**
 * The legacy site uses native <details>/<summary> elements for the FAQ
 * accordion — open/close and the +/× rotation are handled entirely by the
 * existing `.faq` CSS (`summary::after` + `details[open]`). app.js never
 * scripts the FAQ, so native <details> reproduces its behavior exactly.
 */
export function Faq() {
  return (
    <section id="faq">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Questions</span>
          <h2>Frequently asked</h2>
          <p>Everything you might want to know before you start.</p>
        </Reveal>
        <Reveal className="faq">
          <details className="glass">
            <summary>Is Zeitra only for night-shift workers?</summary>
            <p>
              No. Zeitra is built for <em>any</em> non-standard schedule — fixed nights, rotating,
              12-hour, split shifts, on-call and irregular. If you don&apos;t work a clean 9-to-5,
              Zeitra adapts to whatever you actually work.
            </p>
          </details>
          <details className="glass">
            <summary>How is this different from MyFitnessPal or other trackers?</summary>
            <p>
              Regular trackers assume you eat breakfast, lunch and dinner against daylight. Zeitra
              times everything around your real sleep window using a circadian model — so the plan
              fits your body, not a 9-to-5 it was never designed for.
            </p>
          </details>
          <details className="glass">
            <summary>Do I need wearables or a gym?</summary>
            <p>
              No. Zeitra works from your shift schedule alone. You can add sleep and body-metric
              data if you want sharper plans, and workouts include bodyweight and beginner-friendly
              options that need no equipment.
            </p>
          </details>
          <details className="glass">
            <summary>Does it work offline?</summary>
            <p>
              Yes. A 760+ whole-food library and the full exercise demo set work offline, so you can
              log and train mid-shift even when signal is bad.
            </p>
          </details>
          <details className="glass">
            <summary>What does it cost?</summary>
            <p>
              Zeitra is free forever for the core experience — logging, basic AI plans and the
              offline libraries. Pro and Premium add unlimited AI, weekly coach reports, advanced
              analytics and human coaches. Launch pricing is announced soon.
            </p>
          </details>
          <details className="glass">
            <summary>When does it launch?</summary>
            <p>
              Zeitra is coming to iOS and Android. Join the waitlist below and we&apos;ll email you
              the moment it&apos;s live on the App Store and Google Play.
            </p>
          </details>
        </Reveal>
      </div>
    </section>
  );
}
