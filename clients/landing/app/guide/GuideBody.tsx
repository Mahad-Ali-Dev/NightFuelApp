'use client';

import { useEffect, useRef } from 'react';

/**
 * Guide body (TOC + content) ported from the legacy `partials/guide.html`.
 *
 * The TOC scroll-spy mirrors `app.js`: an IntersectionObserver watches every
 * `.guide-section[id]`; when one intersects (rootMargin tuned to the viewport
 * middle band) the matching TOC anchor gets the `.active` class.
 *
 * It is a client component because of that observer; the section content
 * itself is otherwise static markup.
 */
export function GuideBody() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;

    const toc = root.querySelector('.guide-toc');
    if (!toc) return;

    const tocLinks: Record<string, HTMLAnchorElement> = {};
    toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      tocLinks[a.getAttribute('href')!.slice(1)] = a;
    });

    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            Object.keys(tocLinks).forEach((id) => {
              tocLinks[id].classList.toggle('active', id === e.target.id);
            });
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );

    const sections = root.querySelectorAll<HTMLElement>('.guide-section[id]');
    sections.forEach((s) => spy.observe(s));

    return () => spy.disconnect();
  }, []);

  return (
    <div className="guide-wrap" ref={rootRef}>
      {/* ── Table of contents ───────────────────────────────────────────── */}
      <aside className="guide-toc" aria-label="Guide contents">
        <div className="toc-title">Contents</div>
        <nav>
          <a href="#getting-started">01 · Getting started</a>
          <a href="#your-shift">02 · Set your shift</a>
          <a href="#fuel-plan">03 · Your daily fuel plan</a>
          <a href="#logging">04 · Logging meals &amp; food</a>
          <a href="#training">05 · Train around fatigue</a>
          <a href="#caffeine">06 · Caffeine &amp; hydration</a>
          <a href="#sleep">07 · Sleep optimization</a>
          <a href="#ria">08 · Ria, your AI coach</a>
          <a href="#community">09 · Community &amp; coaches</a>
          <a href="#subscription">10 · Settings &amp; subscription</a>
          <a href="#tips">11 · Your first week</a>
        </nav>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <article className="guide-content">
        <section className="guide-section" id="getting-started">
          <h2>
            <span className="gnum">1</span> Getting started
          </h2>
          <p>
            Zeitra is free to download on iOS and Android. The first time you
            open it, a short onboarding builds your starting profile — it takes
            about two minutes.
          </p>
          <ol className="steplist">
            <li>
              <strong>Create your account</strong>
              <span>
                Sign up with email. Your data is private and never sold — see
                the <a href="/privacy">Privacy Policy</a>.
              </span>
            </li>
            <li>
              <strong>Set your goal</strong>
              <span>
                Lose fat, build muscle, maintain, or simply feel better on
                shift. You can change this any time.
              </span>
            </li>
            <li>
              <strong>Add your basics</strong>
              <span>
                Height, weight, age and activity level so Zeitra can estimate
                your calorie and macro targets.
              </span>
            </li>
            <li>
              <strong>Choose dietary needs</strong>
              <span>
                Halal, vegan, vegetarian, keto, gluten-free, acne-safe, Ramadan
                and more — turn on what applies.
              </span>
            </li>
            <li>
              <strong>Allow notifications</strong>
              <span>
                So Zeitra can nudge you for meals, caffeine cut-offs and
                hydration at the right time — and stay silent while you sleep.
              </span>
            </li>
          </ol>
          <div className="guide-callout">
            <span className="ci">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </span>
            <p>
              <strong>Tip:</strong> You don&apos;t need a wearable or a gym to
              start. Your shift schedule alone is enough for Zeitra to build a
              plan.
            </p>
          </div>
        </section>

        <section className="guide-section" id="your-shift">
          <h2>
            <span className="gnum">2</span> Set your shift schedule
          </h2>
          <p>
            This is the step that makes Zeitra different. Instead of assuming you
            sleep at night, Zeitra asks how you actually work and anchors
            everything to your real sleep window.
          </p>
          <h3>Pick your pattern</h3>
          <ul>
            <li>
              <strong>Fixed Night</strong> — the same nights every week.
            </li>
            <li>
              <strong>Rotating</strong> — 2-on-2-off, 12-hour, or swinging
              day/night blocks.
            </li>
            <li>
              <strong>Split Shifts</strong> — broken across the day with a gap in
              the middle.
            </li>
            <li>
              <strong>On-Call &amp; Irregular</strong> — never the same twice;
              log shifts as they come.
            </li>
          </ul>
          <p>
            Enter your typical start and end times and your sleep window. As your
            roster changes, open <strong>Shifts → Add shift</strong> to log the
            next one, and the whole plan re-times itself around it.
          </p>
          <div className="guide-callout">
            <span className="ci">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <p>
              <strong>Why it matters:</strong> The same meal hits your body
              differently at 2&nbsp;PM and 2&nbsp;AM. Your shift is the key
              Zeitra uses to time everything correctly.
            </p>
          </div>
        </section>

        <section className="guide-section" id="fuel-plan">
          <h2>
            <span className="gnum">3</span> Read your daily fuel plan
          </h2>
          <p>
            Your home screen is your plan for the current day or shift. The
            circadian ring at the top shows where you are in your body clock;
            below it, your fuel windows are laid out in order.
          </p>
          <h3>The four windows</h3>
          <ul>
            <li>
              <strong>Pre-shift</strong> — a slow-release meal for steady energy
              through the first hours.
            </li>
            <li>
              <strong>Mid-shift</strong> — lighter protein and hydration to stay
              sharp without a crash.
            </li>
            <li>
              <strong>Caffeine cut-off</strong> — the last safe time for coffee
              so it clears before you sleep.
            </li>
            <li>
              <strong>Recovery / sleep-prep</strong> — a wind-down meal that
              helps you settle, not stay wired.
            </li>
          </ul>
          <p>
            Tap any window to see suggested foods, portion sizes and the macros
            behind them. Each card tells you <em>why</em> it&apos;s timed where
            it is.
          </p>
        </section>

        <section className="guide-section" id="logging">
          <h2>
            <span className="gnum">4</span> Logging meals &amp; the food library
          </h2>
          <p>
            Log what you actually eat so Zeitra can keep your plan honest and
            adapt it over time.
          </p>
          <ol className="steplist">
            <li>
              <strong>Search or scan</strong>
              <span>
                Find foods in the 760+ offline whole-food library, or 3M+ branded
                items online, or scan a barcode.
              </span>
            </li>
            <li>
              <strong>Build a plate</strong>
              <span>
                Combine foods and adjust portions; macros and calories update
                live as you go.
              </span>
            </li>
            <li>
              <strong>Save &amp; reuse</strong>
              <span>
                Star meals you eat often to log them again in one tap on your
                next shift.
              </span>
            </li>
          </ol>
          <p>
            Your dietary modes (halal, vegan, keto, etc.) filter suggestions
            automatically, so you only ever see foods that fit.
          </p>
        </section>

        <section className="guide-section" id="training">
          <h2>
            <span className="gnum">5</span> Train around fatigue
          </h2>
          <p>
            Working nights wrecks recovery if you train like it&apos;s a 9-to-5.
            Zeitra adjusts workout intensity to your last shift, sleep quality
            and circadian phase.
          </p>
          <h3>The exercise library</h3>
          <p>
            Browse <strong>2,500+ exercises across 13 muscle groups</strong>,
            each with a video demo and step-by-step form cues you can have read
            aloud. Filter by level (beginner / intermediate / advanced),
            equipment, and primary or secondary muscle.
          </p>
          <h3>Your workout</h3>
          <ul>
            <li>
              Follow a Push-Pull-Legs, full-body or beginner program — or build
              your own.
            </li>
            <li>
              Log sets, reps and weight as you go; rest timers keep you moving.
            </li>
            <li>
              On low-sleep days, Zeitra automatically dials volume and intensity
              back so you recover instead of digging a hole.
            </li>
          </ul>
        </section>

        <section className="guide-section" id="caffeine">
          <h2>
            <span className="gnum">6</span> Caffeine &amp; hydration
          </h2>
          <p>
            Caffeine is a tool, not a habit to fight. Zeitra gives you a real
            cut-off time based on caffeine&apos;s half-life and your sleep window
            — so a 4&nbsp;AM coffee doesn&apos;t keep you awake at 8&nbsp;AM.
          </p>
          <p>
            Hydration targets are tuned to your shift length and intensity, with
            gentle reminders that respect your sleep — you&apos;ll never get a
            buzz at 3&nbsp;PM when you&apos;re finally resting.
          </p>
          <div className="guide-callout">
            <span className="ci">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 2v2M14 2v2M6 2v2" />
                <path d="M4 8h15a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4h-1" />
                <path d="M4 8v9a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8Z" />
              </svg>
            </span>
            <p>
              <strong>Rule of thumb:</strong> stop caffeine ~6 hours before your
              sleep window. Zeitra does this math for you and shows it on your
              plan.
            </p>
          </div>
        </section>

        <section className="guide-section" id="sleep">
          <h2>
            <span className="gnum">7</span> Sleep optimization
          </h2>
          <p>
            Sleep is where the gains and the health actually happen. Zeitra
            protects your sleep window and helps you fall asleep when the sun is
            up.
          </p>
          <ul>
            <li>
              <strong>Wind-down routine</strong> — light, food and screen
              guidance in the hour before sleep.
            </li>
            <li>
              <strong>Sleep optimizer</strong> — practical steps to shift your
              clock faster after a rotation change.
            </li>
            <li>
              <strong>Log your sleep</strong> — quick entries (or synced data)
              sharpen tomorrow&apos;s plan and your weekly report.
            </li>
          </ul>
        </section>

        <section className="guide-section" id="ria">
          <h2>
            <span className="gnum">8</span> Ria, your AI coach
          </h2>
          <p>
            Ria is Zeitra&apos;s coach — a 3-layer engine that combines a
            deterministic circadian model, chrono-nutrition rules and Claude AI
            to personalize your plan and answer questions in plain language.
          </p>
          <h3>What Ria does</h3>
          <ul>
            <li>
              <strong>Answers questions</strong> — &quot;what should I eat at
              3&nbsp;AM?&quot; or &quot;I only slept 4 hours, should I
              train?&quot;
            </li>
            <li>
              <strong>Re-plans on demand</strong> — swap a meal, change a goal,
              or adapt to a last-minute shift.
            </li>
            <li>
              <strong>Weekly reports</strong> — every week Ria reviews adherence,
              sleep, performance and body metrics, then tunes next week
              automatically.
            </li>
          </ul>
          <p>
            Open the coach tab any time to chat. Ria is fast and shift-aware —
            sharper than a generic macro tracker and built for your hours.
          </p>
        </section>

        <section className="guide-section" id="community">
          <h2>
            <span className="gnum">9</span> Community &amp; coaches
          </h2>
          <p>
            You&apos;re not the only one awake at 3&nbsp;AM. Zeitra&apos;s
            community is built for people on the same hours.
          </p>
          <ul>
            <li>
              <strong>Community feed</strong> — share wins, ask questions, and
              follow others on your schedule.
            </li>
            <li>
              <strong>Challenges &amp; leaderboards</strong> — stay motivated
              with friendly, shift-friendly goals.
            </li>
            <li>
              <strong>Coach marketplace</strong> <em>(Premium)</em> — work
              one-on-one with certified coaches who build custom plans and
              message you directly.
            </li>
          </ul>
        </section>

        <section className="guide-section" id="subscription">
          <h2>
            <span className="gnum">10</span> Settings, privacy &amp;
            subscription
          </h2>
          <h3>Your data</h3>
          <p>
            Zeitra treats your health data as private. You can review, export or
            delete your data from <strong>Settings → Privacy &amp; data</strong>{' '}
            at any time. Read the full <a href="/privacy">Privacy Policy</a> and{' '}
            <a href="/terms">Terms of Service</a>.
          </p>
          <h3>Notifications</h3>
          <p>
            Fine-tune which nudges you get — meals, caffeine, hydration, workouts
            and sleep — under <strong>Settings → Notifications</strong>. Zeitra
            schedules them around your sleep, never through it.
          </p>
          <h3>Managing your subscription</h3>
          <ul>
            <li>Free is free forever. Pro and Premium are optional upgrades.</li>
            <li>
              Subscriptions are billed through the <strong>App Store</strong>,{' '}
              <strong>Google Play</strong> or <strong>Stripe</strong>, depending
              on how you signed up.
            </li>
            <li>
              Cancel any time from your store account or{' '}
              <strong>Settings → Subscription</strong>; you keep access until the
              end of the period.
            </li>
          </ul>
        </section>

        <section className="guide-section" id="tips">
          <h2>
            <span className="gnum">11</span> Your first week
          </h2>
          <p>
            A few things that make the biggest difference when you&apos;re
            starting out:
          </p>
          <ul>
            <li>
              <strong>Log honestly for 7 days.</strong> Even rough logging gives
              Ria enough to start tuning your plan.
            </li>
            <li>
              <strong>Respect the caffeine cut-off.</strong> It&apos;s the single
              fastest way to sleep better after a night shift.
            </li>
            <li>
              <strong>Eat your pre-shift meal.</strong> Going in empty is what
              causes the 3&nbsp;AM crash and the vending-machine spiral.
            </li>
            <li>
              <strong>Protect your sleep window.</strong> Treat it like a shift
              you can&apos;t miss — phone on do-not-disturb, room dark.
            </li>
            <li>
              <strong>Read your first weekly report.</strong> That&apos;s where
              Zeitra turns a week of data into next week&apos;s better plan.
            </li>
          </ul>
          <div className="guide-callout">
            <span className="ci">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
              </svg>
            </span>
            <p>
              <strong>Stuck on anything?</strong> Ask Ria in the app, or email{' '}
              <a href="mailto:hello@zeitra.app">hello@zeitra.app</a> — we read
              every message.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
