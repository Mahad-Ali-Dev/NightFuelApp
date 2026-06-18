# Zeitra marketing site (static)

The public landing + legal/support pages served at **https://zeitra.app**.
No backend — plain HTML/CSS/JS. The built output lives in `dist/` and is committed,
so the server needs **no build step** (just serve `dist/`).

## Pages
- `/` — marketing landing (Aurora dark-glass)
- `/support.html` — FAQ + contact
- `/privacy.html`, `/terms.html` — built from `../web/content/{privacy,terms}.md`

## Rebuild (only if you change content)
```bash
npm install
npm run build      # regenerates dist/ (reads legal copy from ../web/content)
```

## Deploy
Serve `dist/` as the web root for `zeitra.app`. See repo-root `DEPLOY-LANDING.md`,
or on the VPS: `git pull` then point the nginx vhost `root` at
`/home/deploy/nightfuel/clients/landing/dist`.

## Notes
- Legal pages are attorney-review drafts with a few `[fill-in]` placeholders.
- The waitlist form falls back to a `mailto:` to hello@zeitra.app. Set `FORMSPREE_ID`
  in `app.js` (then rebuild) to capture emails automatically.
