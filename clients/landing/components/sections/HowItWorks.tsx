import { Reveal } from './Reveal';

export function HowItWorks() {
  return (
    <section id="how">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">How Zeitra works</span>
          <h2>Three steps to eating on your clock</h2>
          <p>Set it once. Zeitra rebuilds your day around every shift you work.</p>
        </Reveal>
        <div className="steps">
          <Reveal className="step glass">
            <div className="snum">1</div>
            <h3>Tell us your shift</h3>
            <p>
              Fixed nights, rotating, split or on-call — enter your pattern once and Zeitra learns
              your real sleep window.
            </p>
          </Reveal>
          <Reveal className="step glass">
            <div className="snum">2</div>
            <h3>Get your timed plan</h3>
            <p>
              Pre-shift, mid-shift, recovery and sleep-prep meals, caffeine cut-offs, hydration and
              workouts — all scheduled to the minute.
            </p>
          </Reveal>
          <Reveal className="step glass">
            <div className="snum">3</div>
            <h3>Adapt every week</h3>
            <p>
              Ria, your AI coach, reviews adherence, sleep and performance, then tunes next week
              automatically.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
