import { Check, X } from 'lucide-react';
import { Reveal } from './Reveal';

export function Comparison() {
  return (
    <section id="compare">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Why Zeitra</span>
          <h2>Not just another tracker</h2>
          <p>The difference isn&apos;t more features — it&apos;s the timing underneath them.</p>
        </Reveal>
        <div className="compare-grid">
          <Reveal className="compare-col glass bad">
            <h3>A regular fitness app</h3>
            <ul>
              <li>
                <span className="ic">
                  <X width={13} height={13} strokeWidth={3} />
                </span>
                Assumes you wake with the sun and sleep at night
              </li>
              <li>
                <span className="ic">
                  <X width={13} height={13} strokeWidth={3} />
                </span>
                Breakfast, lunch and dinner timed to daylight
              </li>
              <li>
                <span className="ic">
                  <X width={13} height={13} strokeWidth={3} />
                </span>
                Reminders that buzz while you&apos;re asleep
              </li>
              <li>
                <span className="ic">
                  <X width={13} height={13} strokeWidth={3} />
                </span>
                No idea when your last coffee should be
              </li>
              <li>
                <span className="ic">
                  <X width={13} height={13} strokeWidth={3} />
                </span>
                The same plan whether you slept 8 hours or 3
              </li>
            </ul>
          </Reveal>
          <Reveal className="compare-col glass good">
            <h3>Zeitra</h3>
            <ul>
              <li>
                <span className="ic">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Built around your <strong>real</strong> sleep window
              </li>
              <li>
                <span className="ic">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Pre-shift, mid-shift, recovery &amp; sleep-prep meals
              </li>
              <li>
                <span className="ic">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Nudges that respect your sleep, never through it
              </li>
              <li>
                <span className="ic">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                A caffeine cut-off calculated from the math
              </li>
              <li>
                <span className="ic">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Workouts that scale to your fatigue and phase
              </li>
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
