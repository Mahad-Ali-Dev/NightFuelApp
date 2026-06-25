import { Check } from 'lucide-react';
import { Reveal } from './Reveal';

export function Science() {
  return (
    <section className="science" id="science">
      <div className="container">
        <Reveal className="glass">
          <div className="science-copy">
            <span className="eyebrow">The science</span>
            <h2>Your circadian clock decides what your food does</h2>
            <p>
              Every cell runs on a ~24-hour rhythm. Insulin sensitivity, core temperature,
              alertness and fat storage all shift through the day — and they don&apos;t reset just
              because your shift does.
            </p>
            <p>
              Zeitra models that rhythm against your real sleep window, then times fuel, caffeine
              and training to where your body actually is — not where the clock on the wall says it
              should be.
            </p>
            <ul className="science-list">
              <li>
                <span className="ck">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Meals anchored to <strong>your</strong> biological night, not midnight
              </li>
              <li>
                <span className="ck">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Caffeine half-life math, so it clears before you sleep
              </li>
              <li>
                <span className="ck">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                Training scheduled at your daily performance peak
              </li>
              <li>
                <span className="ck">
                  <Check width={13} height={13} strokeWidth={3} />
                </span>
                A light &amp; wind-down plan to shift your clock faster after a rotation
              </li>
            </ul>
          </div>
          <div className="science-art" aria-hidden="true">
            <div className="clockface">
              <div className="cf-mid">
                <div className="cf-big">24h</div>
                <div className="cf-sub">Body clock model</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
