#!/usr/bin/env node
/* ============================================================
   ØKT — footer consistency guard
   ------------------------------------------------------------
   The footer link list is hand-duplicated on five pages and must
   be identical everywhere. This script extracts the <a href>
   values inside each page's <footer> and fails if they differ.

   (i.html is intentionally excluded: its footer is left as-is and
   its old "/#..." links are forwarded by the hub shim in site.js.)

   Usage:  node tools/check-footer.mjs
   No dependencies. Dev-only; tools/ is never published.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'okt/index.html', 'pt/index.html', 'privacy.html', 'pt/privacy.html'];

function footerLinks(file) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const m = /<footer[\s\S]*?<\/footer>/i.exec(html);
  if (!m) throw new Error(`${file}: no <footer> found`);
  const block = /<ul class="footer-links">([\s\S]*?)<\/ul>/i.exec(m[0]);
  if (!block) throw new Error(`${file}: no .footer-links list in <footer>`);
  return [...block[1].matchAll(/<a\s[^>]*href="([^"]*)"/gi)].map((x) => x[1]);
}

const results = PAGES.map((f) => ({ file: f, links: footerLinks(f) }));
const ref = results[0];
let bad = 0;

for (const r of results) {
  const same = r.links.length === ref.links.length && r.links.every((h, i) => h === ref.links[i]);
  if (!same) {
    bad++;
    console.error(`✗ ${r.file}: ${JSON.stringify(r.links)}`);
  }
}

if (bad) {
  console.error(`\nExpected every footer to match ${ref.file}: ${JSON.stringify(ref.links)}`);
  process.exit(1);
}
console.log(`✓ footer links identical on ${PAGES.length} pages: ${ref.links.join('  ')}`);
