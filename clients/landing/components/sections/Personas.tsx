import { Activity, Factory, Lock, Martini, Shield, Truck } from 'lucide-react';
import { Reveal } from './Reveal';

export function Personas() {
  return (
    <section id="roles">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Who it&apos;s for</span>
          <h2>Built for your line of work</h2>
          <p>If your hours don&apos;t fit a 9-to-5, Zeitra fits you.</p>
        </Reveal>
        <div className="roles-grid">
          <Reveal className="role glass">
            <div className="ri">
              <Activity width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Healthcare</h3>
            <p>Nurses, doctors and care staff on long nights and rotations.</p>
          </Reveal>
          <Reveal className="role glass">
            <div className="ri">
              <Truck width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Driving &amp; Logistics</h3>
            <p>Truckers, delivery and warehouse crews on the road at odd hours.</p>
          </Reveal>
          <Reveal className="role glass">
            <div className="ri">
              <Shield width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Emergency Services</h3>
            <p>Paramedics, fire, police and ER teams on unpredictable call.</p>
          </Reveal>
          <Reveal className="role glass">
            <div className="ri">
              <Factory width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Manufacturing</h3>
            <p>Factory and plant workers on fixed nights and 12-hour shifts.</p>
          </Reveal>
          <Reveal className="role glass">
            <div className="ri">
              <Lock width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Security</h3>
            <p>Guards and overnight monitoring on long, quiet shifts.</p>
          </Reveal>
          <Reveal className="role glass">
            <div className="ri">
              <Martini width={22} height={22} strokeWidth={2} />
            </div>
            <h3>Hospitality</h3>
            <p>Bar, hotel and casino staff who clock out at sunrise.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
