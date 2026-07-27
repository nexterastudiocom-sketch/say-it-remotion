#!/usr/bin/env node
// Shorts miner (read-only) — extract short-form candidates from an ALREADY-CONFORMANT
// lesson. No new French is authored: every candidate is a moment lifted from the baked
// manifest, so the vocabulary gate stays satisfied by construction.
//
//   node scripts/shorts/mine.mjs [<lesson-id> | --all]
//
// Reads  build/<id>/manifest.json  +  src/data/lessons/<id>.method.json (meta)
// Writes shorts/<id>/candidates.json  — every extractable moment, scored by predicted
//        COLD-audience appeal (people who have never heard of the channel).
//
// Six candidate types (spec):
//   form_note in an ITEM_BLOCK      -> MISTAKE   (highest: immediate stakes)
//   culture_note (NOTE)             -> GOTCHA    (highest: immediate stakes)
//   two items differing by register -> CHOOSE
//   a BUILD_LADDER step             -> BUILD
//   a minimal pair / nasal contrast -> EAR
//   a MAKE_IT_YOURS situation        -> FINISH
//
// This script NEVER touches the lesson pipeline; it only reads finished assets.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);

// SH-09: sample weighted toward OLDER lessons so Shorts do cross-lesson spaced
// retrieval, not just market the newest drop. Appeal score gets an age bonus.
const AGE_BONUS_PER_LESSON = 3; // older lesson number is UNKNOWN here; bonus applied at pick time across lessons

const BOILERPLATE = new Set([
  "listen. don’t say anything yet.", "listen. don't say anything yet.",
  'repeat after me.', 'repeat after me — normal speed this time.',
  "now you’ve heard it. say it again.", "now you've heard it. say it again.",
]);

// Register hints — which items are casual vs formal/neutral, for CHOOSE pairs.
const REGISTER = {
  casual: new Set(['salut']),
  formal: new Set(['bonjour', 'bonsoir', 's’il vous plaît', "s'il vous plaît", 'madame', 'monsieur']),
};

// Same slug rule as build-method-lesson, so we can invert slideId → real item.
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const makeResolver = (items) => {
  const bySlug = new Map(items.map((it) => [slug(it), it]));
  return (slideId = '') => { const m = String(slideId).match(/item-block-(.+)$/); return m ? (bySlug.get(m[1]) || null) : null; };
};
const phoneticFromVisual = (visual = '') => {
  const m = String(visual).match(/\[([^\]]+)\]/);
  return m ? m[1].trim() : null;
};
const nasal = (t = '') => /\bnasal\b|nose|\bon\b is nasal/i.test(t);

function mineLesson(id, manifest, meta) {
  const lines = manifest.lines || [];
  const items = meta.items || [];
  const itemOf = makeResolver(items);
  const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").trim();
  const glossOf = {}; // filled from ITEM_BLOCK english gloss beats
  const frClip = {};  // item -> a natural-rate french beat {videoStart, videoEnd, text}
  const phonetic = {};

  // First pass: per-item gloss, phonetic, and a clean FR clip for FLASH/REVEAL.
  for (const r of lines) {
    const item = itemOf(r.slideId);
    if (!item) continue;
    if (r.visual && !phonetic[item]) { const p = phoneticFromVisual(r.visual); if (p) phonetic[item] = p; }
    if (r.kind === 'english' && r.phase === 'MEET' && /\//.test(r.spokenText || '') && !glossOf[item]) glossOf[item] = r.spokenText.replace(/\.$/, '').trim();
    if (r.kind === 'french' && norm(r.intendedFrench) === norm(item) && (r.rateTag === 'natural' || !frClip[item]))
      frClip[item] = { videoStart: r.videoStart, videoEnd: r.videoEnd, rate: r.rateTag };
  }

  const out = [];
  const clipFor = (item) => frClip[item] || null;

  // ---- MISTAKE — a form_note (the ONE hardest thing) in an ITEM_BLOCK ----------
  for (const r of lines) {
    if (r.stage !== 'ITEM_BLOCK' || r.kind !== 'english' || r.phase !== 'MEET') continue;
    const t = (r.spokenText || '').trim();
    if (!t || BOILERPLATE.has(t.toLowerCase()) || /\//.test(t) || t.split(/\s+/).length <= 4) continue;
    const item = itemOf(r.slideId);
    if (!item) continue;
    out.push({
      type: 'MISTAKE', item,
      score: 90 + (nasal(t) ? 4 : 0),
      why: t,
      hookSeeds: [`You're saying ${item} wrong.`, `Most people botch this French word.`, `${item} — you're probably mispronouncing it.`],
      title: `Stop saying ${item} wrong`,
      target: { french: item, phonetic: phonetic[item] || null, english: glossOf[item] || null },
      clip: clipFor(item), source: { stage: r.stage, sourceLine: r.sourceLine, at: r.videoStart },
    });
  }

  // ---- GOTCHA — a culture_note (NOTE) ----------------------------------------
  for (const r of lines) {
    if (r.phase !== 'NOTE' || r.kind !== 'english') continue;
    const t = (r.spokenText || '').trim();
    if (t.split(/\s+/).length < 6) continue;
    // pick the first taught item the note is about, for a target clip
    const about = items.find((it) => t.toLowerCase().includes(it.replace(/[’']/g, "'").toLowerCase()));
    out.push({
      type: 'GOTCHA', item: about || null,
      score: 92,
      why: t,
      hookSeeds: [`This French word is not optional.`, `Skip this and you're being rude.`, `The one French rule tourists always break.`],
      title: about ? `The ${about} rule tourists break` : `A French rule tourists break`,
      target: about ? { french: about, phonetic: phonetic[about] || null, english: glossOf[about] || null } : null,
      clip: about ? clipFor(about) : null, source: { stage: r.stage, sourceLine: r.sourceLine, at: r.videoStart },
    });
  }

  // ---- CHOOSE — a casual item vs its FORMAL GREETING equivalent (a real
  //      register choice: salut ↔ bonjour/bonsoir), not any casual×formal cross.
  const GREETINGS = new Set(['bonjour', 'bonsoir']);
  const casual = items.filter((it) => REGISTER.casual.has(it.toLowerCase()));
  const formal = items.filter((it) => GREETINGS.has(norm(it)));
  for (const a of casual) for (const b of formal) {
    out.push({
      type: 'CHOOSE', item: `${a} / ${b}`,
      score: 80,
      why: `${a} is casual; ${b} is formal. Use the wrong one and it lands wrong.`,
      hookSeeds: [`${a} or ${b}? Pick wrong and it's awkward.`, `Never say ${a} to your boss.`, `Two French hellos — one is a mistake at work.`],
      title: `${a} vs ${b}: don't mix these up`,
      target: { french: b, phonetic: phonetic[b] || null, english: glossOf[b] || null, alt: { french: a, phonetic: phonetic[a] || null } },
      clip: clipFor(b) || clipFor(a), source: { stage: 'ITEM_BLOCK', pair: [a, b] },
    });
  }

  // ---- BUILD — a BUILD_LADDER step (the biggest/most-complete french line) ----
  const builds = lines.filter((r) => r.stage === 'BUILD_LADDER' && r.kind === 'french' && (r.intendedFrench || '').split(/\s+/).length >= 2);
  const bestBuild = builds.sort((a, b) => (b.intendedFrench || '').length - (a.intendedFrench || '').length)[0];
  if (bestBuild) out.push({
    type: 'BUILD', item: bestBuild.intendedFrench,
    score: 66,
    why: `Build a real French sentence one piece at a time.`,
    hookSeeds: [`Build a French sentence in 10 seconds.`, `You already know enough to say this.`, `French, one block at a time.`],
    title: `Build this French sentence`,
    target: { french: bestBuild.intendedFrench, phonetic: null, english: null },
    clip: { videoStart: bestBuild.videoStart, videoEnd: bestBuild.videoEnd, rate: bestBuild.rateTag }, source: { stage: 'BUILD_LADDER', sourceLine: bestBuild.sourceLine, at: bestBuild.videoStart },
  });

  // ---- EAR — a minimal pair / nasal contrast (from a nasal form_note) ---------
  const nasalItems = [...new Set(out.filter((c) => c.type === 'MISTAKE' && nasal(c.why)).map((c) => c.item))];
  if (nasalItems.length) out.push({
    type: 'EAR', item: nasalItems.join(' / '),
    score: 74,
    why: `French nasal vowels — the sound English doesn't have.`,
    hookSeeds: [`Can you even hear this French sound?`, `The French sound English speakers miss.`, `Your ears aren't ready for this.`],
    title: `The French sound you can't hear yet`,
    target: { french: nasalItems[0], phonetic: phonetic[nasalItems[0]] || null, english: glossOf[nasalItems[0]] || null },
    clip: clipFor(nasalItems[0]), source: { stage: 'ITEM_BLOCK', items: nasalItems },
  });

  // ---- FINISH — a MAKE_IT_YOURS situation ------------------------------------
  const situation = lines.find((r) => r.stage === 'MAKE_IT_YOURS' && r.kind === 'english' && (r.spokenText || '').split(/\s+/).length > 6);
  if (situation) out.push({
    type: 'FINISH', item: null,
    score: 70,
    why: (situation.spokenText || '').trim(),
    hookSeeds: [`Could you finish this in French?`, `You're in a Paris bakery. Now what?`, `Real French, real situation — your turn.`],
    title: `Could you handle this in French?`,
    target: null,
    clip: null, source: { stage: 'MAKE_IT_YOURS', sourceLine: situation.sourceLine, at: situation.videoStart },
  });

  // stable ids + rank
  out.sort((a, b) => b.score - a.score);
  const seq = {};
  for (const c of out) { seq[c.type] = (seq[c.type] || 0) + 1; c.id = `${id}_${c.type.toLowerCase()}_${seq[c.type]}`; }
  return out;
}

async function lessonIds() {
  const dir = path.join(ROOT, 'src/data/lessons');
  const files = existsSync(dir) ? await readdir(dir) : [];
  return files.filter((f) => f.endsWith('.method.json')).map((f) => f.replace('.method.json', ''));
}

const ids = args.includes('--all') ? await lessonIds() : [args.find((a) => !a.startsWith('--')) || 'lesson-01'];
let total = 0;
for (const id of ids) {
  const manPath = path.join(ROOT, `build/${id}/manifest.json`);
  const metaPath = path.join(ROOT, `src/data/lessons/${id}.method.json`);
  if (!existsSync(manPath) || !existsSync(metaPath)) { console.error(`✗ ${id}: missing manifest or lesson json (render it first)`); continue; }
  const manifest = JSON.parse(await readFile(manPath, 'utf8'));
  const meta = JSON.parse(await readFile(metaPath, 'utf8')).meta;
  const candidates = mineLesson(id, manifest, meta);
  const outDir = path.join(ROOT, `shorts/${id}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'candidates.json'), JSON.stringify({ lesson: id, minedAt: null, count: candidates.length, candidates }, null, 2) + '\n');
  total += candidates.length;
  const by = candidates.reduce((a, c) => ((a[c.type] = (a[c.type] || 0) + 1), a), {});
  console.log(`✓ ${id}: ${candidates.length} candidates → shorts/${id}/candidates.json  ${JSON.stringify(by)}`);
}
console.log(`\n${total} candidate(s) across ${ids.length} lesson(s). Top by appeal drive MISTAKE/GOTCHA first.`);
