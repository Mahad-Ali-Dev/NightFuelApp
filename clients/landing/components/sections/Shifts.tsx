import { Bell, Hourglass, Moon, RefreshCw } from 'lucide-react';
import { Reveal } from './Reveal';

export function Shifts() {
  return (
    <section id="shifts">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Whatever you work</span>
          <h2>Made for your schedule</h2>
          <p>Tell Zeitra your shift pattern once — it adapts to every kind.</p>
        </Reveal>
        <div className="shifts-grid">
          <Reveal className="shift glass">
            <div className="si">
              <Moon width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Fixed Night</h3>
            <p>Same nights, every week.</p>
          </Reveal>
          <Reveal className="shift glass">
            <div className="si">
              <RefreshCw width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Rotating</h3>
            <p>2-on-2-off, 12-hour, swinging.</p>
          </Reveal>
          <Reveal className="shift glass">
            <div className="si">
              <Hourglass width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Split Shifts</h3>
            <p>Broken across the day.</p>
          </Reveal>
          <Reveal className="shift glass">
            <div className="si">
              <Bell width={22} height={22} strokeWidth={2} />
            </div>
            <h3>On-Call &amp; Irregular</h3>
            <p>Never the same twice.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
