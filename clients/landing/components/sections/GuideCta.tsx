import { Reveal } from './Reveal';

export function GuideCta() {
  return (
    <section className="guidecta" id="guide-preview">
      <div className="container">
        <Reveal className="glass">
          <div>
            <span className="eyebrow">New to shift-based nutrition?</span>
            <h2>A complete guide to your first week</h2>
            <p>
              From setting your shift to reading your daily plan, timing caffeine and training
              around fatigue — the Zeitra guide walks you through everything, step by step.
            </p>
            <a className="btn btn-primary" href="/guide.html">
              Read the user guide
            </a>
          </div>
          <div className="guide-toclist">
            <a href="/guide.html#getting-started">
              <span className="gn">01</span> Getting started
            </a>
            <a href="/guide.html#your-shift">
              <span className="gn">02</span> Set your shift schedule
            </a>
            <a href="/guide.html#fuel-plan">
              <span className="gn">03</span> Read your daily fuel plan
            </a>
            <a href="/guide.html#training">
              <span className="gn">05</span> Train around fatigue
            </a>
            <a href="/guide.html#ria">
              <span className="gn">08</span> Work with Ria, your AI coach
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
