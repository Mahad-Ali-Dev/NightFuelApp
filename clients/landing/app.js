// Zeitra landing — tiny, dependency-free progressive enhancement.
(function () {
  'use strict';

  // ── Mobile nav toggle ────────────────────────────────────────────────
  var toggle = document.querySelector('.nav-toggle');
  var header = document.querySelector('.site-header');
  if (toggle && header) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    header.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        header.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ── Reveal-on-scroll ─────────────────────────────────────────────────
  var io;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      io.observe(el);
    });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('in');
    });
  }

  // ── Waitlist form ────────────────────────────────────────────────────
  // Set FORMSPREE_ID (e.g. 'xyzabcd' from https://formspree.io) to capture
  // emails directly. Until then the form falls back to a pre-filled email to
  // hello@zeitra.app so no lead is ever silently dropped.
  var FORMSPREE_ID = '';
  var form = document.querySelector('#waitlist-form');
  if (form) {
    var statusEl = form.querySelector('.form-status');
    var input = form.querySelector('input[type="email"]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (input && input.value || '').trim();
      if (!email || email.indexOf('@') === -1) {
        if (statusEl) statusEl.textContent = 'Please enter a valid email address.';
        return;
      }
      if (FORMSPREE_ID) {
        fetch('https://formspree.io/f/' + FORMSPREE_ID, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'zeitra.app waitlist' }),
        })
          .then(function (r) {
            if (statusEl)
              statusEl.textContent = r.ok
                ? "You're on the list — we'll email you at launch. 🎉"
                : 'Something went wrong. Please email hello@zeitra.app.';
            if (r.ok && input) input.value = '';
          })
          .catch(function () {
            if (statusEl) statusEl.textContent = 'Network error. Please email hello@zeitra.app.';
          });
      } else {
        // No capture backend configured yet — open the user's mail client so
        // the lead still reaches us.
        window.location.href =
          'mailto:hello@zeitra.app?subject=' +
          encodeURIComponent('Zeitra waitlist') +
          '&body=' +
          encodeURIComponent('Please add me to the Zeitra launch waitlist: ' + email);
        if (statusEl)
          statusEl.textContent = "Opening your email app — hit send and you're on the list.";
      }
    });
  }

  // ── Guide TOC scroll-spy ─────────────────────────────────────────────
  var toc = document.querySelector('.guide-toc');
  if (toc && 'IntersectionObserver' in window) {
    var tocLinks = {};
    toc.querySelectorAll('a[href^="#"]').forEach(function (a) {
      tocLinks[a.getAttribute('href').slice(1)] = a;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            Object.keys(tocLinks).forEach(function (id) {
              tocLinks[id].classList.toggle('active', id === e.target.id);
            });
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    document.querySelectorAll('.guide-section[id]').forEach(function (s) {
      spy.observe(s);
    });
  }
})();
