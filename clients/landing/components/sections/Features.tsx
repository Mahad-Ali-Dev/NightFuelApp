import { BarChart3, Clock, Coffee, Droplet, Leaf, Moon, Sparkles, Video } from 'lucide-react';
import { Reveal } from './Reveal';

export function Features() {
  return (
    <section id="features">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Everything in one app</span>
          <h2>Built around your shift, not the sun</h2>
          <p>The full toolkit other fitness apps get wrong for people who work nights.</p>
        </Reveal>
        <div className="features-grid">
          <Reveal className="feature glass">
            <div className="ficon">
              <Clock width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Reverse meal timing</h3>
            <p>
              Pre-shift, mid-shift, recovery and sleep-prep meals — scheduled around your sleep
              window by chrono-nutrition science.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Sparkles width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Meet Ria, your 3-layer AI</h3>
            <p>
              A deterministic circadian model + chrono-nutrition rules + Claude AI personalize every
              plan. Faster than ChatGPT, sharper than a macro tracker.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Coffee width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Caffeine timing that works</h3>
            <p>
              Real cut-off windows for night shifts — so you&apos;re not lying awake at 8 AM after a
              coffee at 4 AM.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Leaf width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Foods, online or off</h3>
            <p>
              760 whole foods offline, 3M+ branded items online. Halal, vegan, keto, gluten-free,
              acne-safe and Ramadan modes built in.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              {/* Custom "fatigue-adjust" glyph — no clean lucide equivalent */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6.5 6.5 11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7" />
              </svg>
            </div>
            <h3>Fatigue-aware workouts</h3>
            <p>
              Intensity auto-adjusts to your last shift, sleep quality and circadian phase. PPL,
              full-body and beginner-friendly progressions.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Video width={24} height={24} strokeWidth={2} />
            </div>
            <h3>2,500+ exercise demos</h3>
            <p>
              A full video library across 13 muscle groups, with form cues read aloud — split by
              level, equipment and primary muscle.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Moon width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Sleep optimization</h3>
            <p>
              Wind-down routines, light and caffeine guidance, and a sleep window tuned to your
              rotation — so you fall asleep at 8 AM.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <Droplet width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Hydration &amp; reminders</h3>
            <p>
              Shift-aware water targets and local nudges that respect your sleep — never a buzz at 3
              PM when you&apos;re finally resting.
            </p>
          </Reveal>
          <Reveal className="feature glass">
            <div className="ficon">
              <BarChart3 width={24} height={24} strokeWidth={2} />
            </div>
            <h3>Weekly AI coach reports</h3>
            <p>
              Ria reviews your week — adherence, sleep, performance and body metrics — and adapts
              next week&apos;s plan automatically.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
