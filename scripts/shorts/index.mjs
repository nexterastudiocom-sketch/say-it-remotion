#!/usr/bin/env node
// Shorts preview grid → out/shorts/index.html. Muted autoplay, looping, so you
// judge the sound-OFF experience the way most viewers first get it. Groups the
// three hook variants per short so A/B is a glance.
//
//   node scripts/shorts/index.mjs [<lesson-id> | --all]

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);

async function metaFiles(id) {
  const dir = path.join(ROOT, `shorts/${id}`);
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith('.meta.json')).map((f) => path.join(dir, f));
}
async function lessonIds() {
  const d = path.join(ROOT, 'shorts');
  return existsSync(d) ? (await readdir(d)).filter((f) => existsSync(path.join(d, f, 'candidates.json'))) : [];
}

const ids = args.includes('--all') ? await lessonIds() : [args.find((a) => !a.startsWith('--')) || 'lesson-01'];
const cards = [];
for (const id of ids) for (const mf of await metaFiles(id)) {
  const m = JSON.parse(await readFile(mf, 'utf8'));
  const vs = Object.entries(m.variants || {}).filter(([, v]) => existsSync(path.join(ROOT, v.file)));
  if (!vs.length) continue;
  const players = vs.map(([vk, v]) => `
    <figure>
      <video src="../../${v.file}" muted autoplay loop playsinline preload="metadata"></video>
      <figcaption><b>${vk}</b> — ${esc(v.hook)}${v.hasVoice ? ' 🔊' : ''}</figcaption>
    </figure>`).join('');
  cards.push(`
  <section class="card">
    <header><span class="pill ${m.type}">${m.type}</span> <span class="lvl">${m.level}</span> <span class="ttl">${esc(m.title)}</span></header>
    <div class="row">${players}</div>
    <footer>${(m.hashtags || []).map((h) => `<code>${esc(h)}</code>`).join(' ')} · <span class="desc">${esc(m.description)}</span></footer>
  </section>`);
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Say It · Shorts preview</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0E1116;color:#F2F2F2;font:15px/1.4 -apple-system,Inter,system-ui,sans-serif}
  h1{padding:24px 28px 0;margin:0;font-size:22px}
  .sub{padding:2px 28px 18px;color:#9aa0aa}
  .grid{display:grid;grid-template-columns:1fr;gap:22px;padding:0 28px 60px}
  .card{background:#171B22;border:1px solid #262b34;border-radius:16px;padding:16px 18px}
  header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .pill{font-weight:800;font-size:12px;letter-spacing:.06em;padding:5px 12px;border-radius:999px;background:#2E4FE0;color:#fff}
  .pill.MISTAKE,.pill.GOTCHA{background:#E14B3B}
  .lvl{font-weight:700;background:#B56AE7;color:#14121A;padding:4px 10px;border-radius:8px;font-size:12px}
  .ttl{font-weight:600}
  .row{display:flex;gap:16px;flex-wrap:wrap}
  figure{margin:0}
  video{width:220px;height:391px;border-radius:12px;background:#000;object-fit:cover;display:block}
  figcaption{font-size:12px;color:#c7ccd4;margin-top:8px;max-width:220px}
  footer{margin-top:12px;color:#9aa0aa;font-size:13px}
  code{background:#222833;padding:2px 8px;border-radius:6px;color:#cbd3df}
  .desc{color:#7f8794}
</style></head><body>
<h1>Say It · Shorts preview</h1>
<div class="sub">${cards.length} short(s) · muted autoplay + loop — this is the sound-off first impression viewers get.</div>
<div class="grid">${cards.join('\n')}</div>
</body></html>`;

const out = path.join(ROOT, 'out/shorts/index.html');
await writeFile(out, html);
console.log(`✓ ${cards.length} short(s) → out/shorts/index.html`);
