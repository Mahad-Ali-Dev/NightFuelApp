import { Check } from 'lucide-react';
import { Reveal } from './Reveal';

export function Pricing() {
  return (
    <section id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>Free forever. Pro when you want it.</h2>
          <p>Start free, upgrade only if you need more. No ads, ever.</p>
        </Reveal>
        <div className="pricing-grid">
          <Reveal className="plan glass">
            <h3>Free</h3>
            <div className="price">
              $0<span> / forever</span>
            </div>
            <p className="plan-note">Everything you need to start eating on your clock.</p>
            <ul>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Full meal &amp; workout logging
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Basic AI plans from Ria
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Offline food &amp; exercise library
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                30-day history
              </li>
            </ul>
            <a className="btn btn-ghost" href="#waitlist">
              Join the waitlist
            </a>
          </Reveal>
          <Reveal className="plan glass featured">
            <span className="ribbon">Most popular</span>
            <h3>Pro</h3>
            <div className="price">
              Launch<span> pricing soon</span>
            </div>
            <p className="plan-note">For shift workers who want the full engine.</p>
            <ul>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Unlimited AI plans &amp; re-plans
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Weekly AI coach reports
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Advanced analytics &amp; trends
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Full history, no limits
              </li>
            </ul>
            <a className="btn btn-primary" href="#waitlist">
              Get early access
            </a>
          </Reveal>
          <Reveal className="plan glass">
            <h3>Premium</h3>
            <div className="price">
              Launch<span> pricing soon</span>
            </div>
            <p className="plan-note">Everything in Pro, plus real human coaches.</p>
            <ul>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Coach marketplace access
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Custom plans from certified pros
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Priority support
              </li>
              <li>
                <span className="ck">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                Everything in Pro
              </li>
            </ul>
            <a className="btn btn-ghost" href="#waitlist">
              Join the waitlist
            </a>
          </Reveal>
        </div>
        <p className="pricing-foot">
          Cancel anytime. Subscriptions are billed through the App Store, Google Play or Stripe. See{' '}
          <a href="/guide.html#subscription" style={{ color: 'var(--lime)' }}>
            managing your subscription
          </a>
          .
        </p>
      </div>
    </section>
  );
}
