# oktapp-website

Static site for ØKT, served at [oktapp.com](https://oktapp.com) via GitHub Pages
(custom domain in `CNAME`). **No build step** — the committed files are what is
served, as copied by the deploy workflow (see **Deploy** below).

```
index.html          home page (page-local <style> in <head>)
privacy.html        privacy policy
i.html              /i — landing page for the session-QR universal link (noindex)
.well-known/        apple-app-site-association (published thanks to .nojekyll)
assets/site.css     shared styles
assets/site.js      language switching, drawer, scroll reveal, FAQ
assets/i18n.js      EN/NO copy dictionary
tools/              dev-only scripts, not served (see Deploy)
```

## Deploy

Pushing to `main` triggers [`.github/workflows/pages.yml`](.github/workflows/pages.yml),
which publishes **only** a fixed list of files via GitHub Actions (not a plain
"serve the whole repo" deploy). `README.md`, `LICENSE`, `tools/` and `.github/`
are never published. The workflow fails if the published set is missing a
required file or contains `README.md`/`tools/`.

**Adding a new page or top-level file that should be public?** Add it to the
copy step in `.github/workflows/pages.yml` — it will not be served otherwise.

## Security

Never commit secrets (API keys, tokens, credentials) — this repository is
public, and so is its history.

## Copy and translations

All user-facing copy lives in `assets/i18n.js` as `{ en, no }` pairs.
**The dictionary is the source of truth.** `applyLang()` in `assets/site.js`
applies it at runtime:

| Markup | Behaviour |
|---|---|
| `data-i18n="key"` | sets `innerHTML` — inline `<br>`, `<strong>`, `<a>` are kept |
| `data-i18n-attr="placeholder:key;aria-label:key2"` | sets attributes, tags **stripped** |
| `<body data-title-key … data-desc-key …>` | overwrites `<title>`, `meta[description]`, `og:title`, `og:description` |

The literal text inside a `data-i18n` element is a **fallback**: it is what gets
served before JS runs, and what search engines, social-card scrapers and no-JS
visitors see. It must stay identical to the English dictionary value.

### Checking fallbacks

```bash
node tools/check-fallbacks.mjs            # exits 1 on any drift
node tools/check-fallbacks.mjs --report   # full per-key classification table
```

Run it after editing `assets/i18n.js` or either HTML file. It compares every
fallback, i18n-driven attribute and `<head>` meta value against the English
dictionary and prints a have/want diff for anything out of sync. Requires only
Node (no dependencies, nothing installed).

If it fails, **fix the HTML, not the dictionary.**

### Cache busting — bump `?v=` when you change an asset

`site.css`, `site.js` and `i18n.js` are loaded with a `?v=<date>` query string
in **both** `index.html` and `privacy.html`. GitHub Pages serves them with
`Cache-Control: max-age=600`, so without it a returning visitor keeps a stale
copy for up to ten minutes after a deploy.

For `i18n.js` that is worse than ordinary staleness: `applyLang()` overwrites
the HTML at runtime, so a stale dictionary **silently replaces correct copy with
old strings**. The page ships the right text, then JS puts the wrong text back.
Scrapers and `curl` still see the correct fallback, so the bug is invisible to
any check that does not run JS.

**After changing any file in `assets/`, bump `?v=` to the current date in both
HTML files.** Keep the value identical across all three tags and both pages.
