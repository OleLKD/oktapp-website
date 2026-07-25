#!/usr/bin/env node
/* ============================================================
   ØKT — fallback drift guard
   ------------------------------------------------------------
   The literal text inside every [data-i18n] element is only a
   FALLBACK: applyLang() in assets/site.js overwrites it once JS
   runs. But it is what crawlers, social scrapers and no-JS
   visitors actually see, so it must stay identical to the
   English value in assets/i18n.js.

   This script compares, for index.html and privacy.html:
     · [data-i18n]        inner HTML  vs  S[key].en   (HTML kept)
     · [data-i18n-attr]   attribute   vs  S[key].en   (tags stripped)
     · <title> / description / og:title / og:description
       vs the keys named by <body data-title-key|data-desc-key>

   Usage:
     node tools/check-fallbacks.mjs            # guard: exit 1 on drift
     node tools/check-fallbacks.mjs --report   # full classification table

   No dependencies. Dev-only; nothing here ships to the site.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'privacy.html'];

/* ── load the dictionary ─────────────────────────────────── */

function loadStrings() {
  const src = readFileSync(join(ROOT, 'assets/i18n.js'), 'utf8');
  const window = {};
  // The file is a single `window.OKT_STRINGS = {...};` assignment.
  new Function('window', src)(window);
  if (!window.OKT_STRINGS) throw new Error('OKT_STRINGS not found in assets/i18n.js');
  return window.OKT_STRINGS;
}

/* ── minimal HTML helpers ────────────────────────────────── */

const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source']);

// Given the index of a '<' opening an element, return [innerStart, innerEnd].
// Walks forward tracking nesting of the same tag name.
function innerRange(html, tagStart) {
  const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(html.slice(tagStart));
  if (!nameMatch) return null;
  const tag = nameMatch[1].toLowerCase();
  if (VOID.has(tag)) return null;

  const openEnd = html.indexOf('>', tagStart);
  if (openEnd === -1) return null;
  if (html[openEnd - 1] === '/') return null; // self-closed

  const re = new RegExp(`<(/?)${tag}(?=[\\s/>])`, 'gi');
  re.lastIndex = openEnd + 1;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return [openEnd + 1, m.index];
  }
  return null;
}

// Find every element carrying `attr`, returning its value + inner range.
function findByAttr(html, attr) {
  const out = [];
  const re = new RegExp(`\\s${attr}="([^"]*)"`, 'g');
  let m;
  while ((m = re.exec(html))) {
    const tagStart = html.lastIndexOf('<', m.index);
    const range = innerRange(html, tagStart);
    out.push({
      key: m[1],
      line: html.slice(0, m.index).split('\n').length,
      inner: range ? html.slice(range[0], range[1]) : null,
      tagStart,
    });
  }
  return out;
}

function attrOf(tagHtml, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tagHtml);
  return m ? m[1] : null;
}

function metaContent(html, selectorAttr, value) {
  const re = new RegExp(`<meta[^>]*${selectorAttr}="${value}"[^>]*>`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  return { content: attrOf(m[0], 'content'), line: html.slice(0, m.index).split('\n').length };
}

const stripTags = (s) => s.replace(/<[^>]+>/g, '');
const norm = (s) => (s == null ? s : s.replace(/\s+/g, ' ').trim());
const decode = (s) =>
  s == null ? s : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/* ── audit one page ──────────────────────────────────────── */

function auditPage(file, S) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const rows = [];

  const check = (kind, key, actual, expected, line) => {
    let status;
    if (expected === undefined) status = 'KEY MISSING';
    else if (actual === null || actual === '') status = 'EMPTY';
    else if (norm(decode(actual)) === norm(decode(expected))) status = 'ok';
    else status = 'STALE';
    rows.push({ file, kind, key, line, actual, expected, status });
  };

  for (const el of findByAttr(html, 'data-i18n')) {
    check('text', el.key, el.inner, S[el.key]?.en, el.line);
  }

  for (const el of findByAttr(html, 'data-i18n-attr')) {
    const tagHtml = html.slice(el.tagStart, html.indexOf('>', el.tagStart) + 1);
    for (const pair of el.key.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s && s.trim());
      if (!attr || !key) continue;
      const expected = S[key]?.en === undefined ? undefined : stripTags(S[key].en);
      check(`attr:${attr}`, key, attrOf(tagHtml, attr), expected, el.line);
    }
  }

  // <head> values, driven by <body data-title-key|data-desc-key>
  const bodyStart = html.indexOf('<body');
  const bodyTag = html.slice(bodyStart, html.indexOf('>', bodyStart) + 1);
  const titleKey = attrOf(bodyTag, 'data-title-key');
  const descKey = attrOf(bodyTag, 'data-desc-key');

  if (titleKey) {
    const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
    check('head:title', titleKey, m ? m[1] : null, S[titleKey]?.en,
      m ? html.slice(0, m.index).split('\n').length : 0);
    const og = metaContent(html, 'property', 'og:title');
    if (og) check('head:og:title', titleKey, og.content, S[titleKey]?.en, og.line);
  }
  if (descKey) {
    const d = metaContent(html, 'name', 'description');
    if (d) check('head:description', descKey, d.content, S[descKey]?.en, d.line);
    const og = metaContent(html, 'property', 'og:description');
    if (og) check('head:og:description', descKey, og.content, S[descKey]?.en, og.line);
  }

  return rows;
}

/* ── run ─────────────────────────────────────────────────── */

const S = loadStrings();
const rows = PAGES.flatMap((f) => auditPage(f, S));
const bad = rows.filter((r) => r.status !== 'ok');
const report = process.argv.includes('--report');

if (report) {
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  for (const f of PAGES) {
    console.log(`\n=== ${f} ===`);
    for (const r of rows.filter((x) => x.file === f)) {
      const tag = r.status === 'ok' ? '  ok  ' : ` ${r.status} `;
      console.log(`[${tag}] ${String(r.line).padStart(4)}  ${r.kind}  ${r.key}`);
      if (r.status === 'STALE') {
        console.log(`            have: ${JSON.stringify(norm(r.actual))}`);
        console.log(`            want: ${JSON.stringify(norm(r.expected))}`);
      }
    }
  }
  console.log('\n--- totals ---');
  console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('   '));
  console.log(`checked ${rows.length} values across ${PAGES.length} pages`);
}

if (bad.length) {
  if (!report) {
    console.error(`\n✗ ${bad.length} fallback(s) out of sync with assets/i18n.js:\n`);
    for (const r of bad) {
      console.error(`  ${r.file}:${r.line}  [${r.status}]  ${r.kind}  ${r.key}`);
      if (r.status === 'STALE') {
        console.error(`      have: ${JSON.stringify(norm(r.actual))}`);
        console.error(`      want: ${JSON.stringify(norm(r.expected))}`);
      } else if (r.status === 'EMPTY') {
        console.error(`      want: ${JSON.stringify(norm(r.expected))}`);
      }
    }
    console.error('\nThe dictionary is the source of truth — update the HTML, not assets/i18n.js.\n');
  }
  process.exit(1);
}

console.log(`✓ all ${rows.length} fallbacks match the English dictionary`);
