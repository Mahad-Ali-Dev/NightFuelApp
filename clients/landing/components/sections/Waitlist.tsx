'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Reveal } from './Reveal';

// Set FORMSPREE_ID (e.g. 'xyzabcd' from https://formspree.io) to capture
// emails directly. Until then the form falls back to a pre-filled email to
// hello@zeitra.app so no lead is ever silently dropped. (Mirrors app.js.)
const FORMSPREE_ID = '';

export function Waitlist() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const email = (inputRef.current?.value || '').trim();
    if (!email || email.indexOf('@') === -1) {
      setStatus('Please enter a valid email address.');
      return;
    }
    if (FORMSPREE_ID) {
      fetch('https://formspree.io/f/' + FORMSPREE_ID, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'zeitra.app waitlist' }),
      })
        .then(function (r) {
          setStatus(
            r.ok
              ? "You're on the list — we'll email you at launch. 🎉"
              : 'Something went wrong. Please email hello@zeitra.app.',
          );
          if (r.ok && inputRef.current) inputRef.current.value = '';
        })
        .catch(function () {
          setStatus('Network error. Please email hello@zeitra.app.');
        });
    } else {
      // No capture backend configured yet — open the user's mail client so
      // the lead still reaches us.
      window.location.href =
        'mailto:hello@zeitra.app?subject=' +
        encodeURIComponent('Zeitra waitlist') +
        '&body=' +
        encodeURIComponent('Please add me to the Zeitra launch waitlist: ' + email);
      setStatus("Opening your email app — hit send and you're on the list.");
    }
  }

  return (
    <section className="waitlist" id="waitlist">
      <div className="container">
        <Reveal className="glass">
          <span className="eyebrow">Launching on iOS &amp; Android</span>
          <h2>Be first through the door.</h2>
          <p>
            Join the waitlist and we&apos;ll email you the moment Zeitra hits the App Store and
            Google Play.
          </p>
          <form id="waitlist-form" noValidate onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="email"
              name="email"
              placeholder="you@email.com"
              aria-label="Email address"
              autoComplete="email"
              required
            />
            <button className="btn btn-primary" type="submit">
              Notify me
            </button>
          </form>
          <div className="form-status" role="status" aria-live="polite">
            {status}
          </div>
          <p className="form-fine">
            No spam — one email at launch. Or reach us at{' '}
            <a href="mailto:hello@zeitra.app">hello@zeitra.app</a>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
