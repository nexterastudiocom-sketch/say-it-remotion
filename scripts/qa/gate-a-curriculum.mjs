#!/usr/bin/env node
// GATE A · curriculum-check  (pre-render, manifest only)
//
//   node scripts/qa/gate-a-curriculum.mjs <video-id>            # check, write findings
//   node scripts/qa/gate-a-curriculum.mjs <video-id> --commit   # append newly-taught → lexicon (only after the video passes)
//
// Loads state/lexicon.json (cumulative words/phrases/structures taught in videos
// 1..N-1) and flags any French token used in video N that was never introduced
// and isn't glossed in-video. Exits non-zero if a HIGH-severity finding exists
// (so the render step can block). --commit appends this video's taught items to
// the lexicon — call it ONLY after the video has passed both gates + approval.

import { existsSync } from 'node:fs';
import { paths, readJson, writeJson, writeFindings, finding } from './lib.mjs';

// Tokenize French for matching: drop apostrophes ("s'il"→"sil"), treat ellipsis
// and punctuation as separators, strip accents. "Bon... jour." → ["bon","jour"].
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const canonTokens = (s) => stripAccents(String(s).toLowerCase())
  .replace(/[’'`]/g, '').replace(/\.\.\.|…/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(Boolean);
const canon = (s) => canonTokens(s).join(' ');

const id = process.argv[2] || 'lesson-01';
const commit = process.argv.includes('--commit');
const P = paths(id);
if (!existsSync(P.manifest)) { console.error(`✗ no manifest — run: node scripts/qa/manifest.mjs ${id}`); process.exit(2); }

const manifest = await readJson(P.manifest);
const lexicon = existsSync(P.lexicon) ? await readJson(P.lexicon) : { version: 1, videos: [], phrases: [], words: [], structures: [], allow: ['bravo'] };
const allow = new Set((lexicon.allow || []).map(canon));

// Taught items as token-arrays (spaced phrases) + a despaced set (for syllable
// runs). Registered from the cumulative lexicon + this video's teaching.
const taughtArrays = []; // [['au','revoir'], ['sil','vous','plait'], ...]
const taughtDespaced = new Set(); // 'aurevoir', 'silvousplait', 'bonjour', ...
const addTaught = (w) => { const t = canonTokens(w); if (t.length) { taughtArrays.push(t); taughtDespaced.add(t.join('')); } };
for (const w of [...(lexicon.phrases || []), ...(lexicon.words || [])]) addTaught(w);

// ---- what this video TEACHES in-video (so its own new words aren't flagged) ----
// 1) headwords of vocab slides  2) French words the narrator GLOSSES in "quotes".
const vocabWords = new Set();
for (const r of manifest.lines) {
  if (r.slideType === 'vocab' && r.onScreenText) {
    for (const part of String(r.onScreenText).split('/')) { const w = canon(part); if (w) { addTaught(part); vocabWords.add(w); } }
  }
}
// SUBJECT slide ("A new one") teaches a headword too (e.g. bonsoir) — its first French line.
for (const r of manifest.lines) {
  if (/a new one/i.test(r.onScreenLabel || '') && r.kind === 'french') { const w = canon(r.spokenText); if (w) { addTaught(r.spokenText); vocabWords.add(w); } break; }
}
// Glossed-in-quotes: a French word the English narrator puts in DOUBLE quotes.
const glossed = new Set();
for (const r of manifest.lines) {
  if (r.kind === 'english' && r.spokenText) {
    for (const m of r.spokenText.matchAll(/["“”]([^"“”]{2,24})["“”]/g)) { const w = canon(m[1]); if (w && w.split(' ').length <= 3) { addTaught(m[1]); glossed.add(w); } }
  }
}
taughtArrays.sort((a, b) => b.length - a.length); // longest phrase first

// Cover a token sequence: match a taught phrase, or a run of syllables that
// concatenate to a taught word. Returns the indices left uncovered.
function uncoveredIndices(tokens) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    let step = 0;
    for (const arr of taughtArrays) { // multi-word phrase match
      if (arr.length <= tokens.length - i && arr.every((w, k) => w === tokens[i + k])) { step = arr.length; break; }
    }
    if (!step) { // syllable run → concatenated taught word (e.g. bon+jour)
      for (let j = Math.min(tokens.length, i + 4); j > i; j--) if (taughtDespaced.has(tokens.slice(i, j).join(''))) { step = j - i; break; }
    }
    if (step) { i += step; } else { out.push(i); i++; }
  }
  return out;
}

const uncovered = new Map(); // token → {timestamp, line, context}
for (const r of manifest.lines) {
  if (r.kind !== 'french' || !r.intendedFrench) continue;
  const tokens = canonTokens(r.intendedFrench);
  for (const idx of uncoveredIndices(tokens)) {
    const tok = tokens[idx];
    if (/^\d+$/.test(tok) || tok.length < 2) continue;
    if (!uncovered.has(tok)) uncovered.set(tok, { timestamp: r.videoStart, line: r.sourceLine, context: r.intendedFrench });
  }
}

const findings = [];
for (const [tok, info] of uncovered) {
  const sev = allow.has(tok) ? 'low' : 'high';
  findings.push(finding('curriculum', sev, info.timestamp,
    `French token "${tok}" is used but was never introduced or glossed (video ${id}${lexicon.videos?.length ? `, after ${lexicon.videos.length} prior video(s)` : ''}).`,
    { token: tok, firstLine: `"${info.context}"`, sourceLine: info.line, taughtInVideo: [...vocabWords], glossedInVideo: [...glossed] },
    allow.has(tok) ? 'Known interjection/cognate — add to lexicon.allow if intended, or gloss it in-video.'
      : `Introduce "${tok}" with a WORD segment or an in-line English gloss before this point, or add it to state/lexicon.json if a previous video taught it.`));
}

await writeFindings(id, 'curriculum', findings);
const high = findings.filter((f) => f.severity === 'high');
console.log(`GATE A · curriculum-check — ${manifest.frenchLineCount} French lines, ${taughtArrays.length} taught items`);
console.log(`  taught in-video: ${[...vocabWords].join(', ') || '(none)'}`);
console.log(`  glossed in-video: ${[...glossed].join(', ') || '(none)'}`);
if (!findings.length) console.log('  ✓ every French token is introduced or glossed.');
else for (const f of findings) console.log(`  ${f.severity === 'high' ? '✗' : '⚠'} [${f.severity}] "${f.evidence.token}" — first at ${f.timestamp}s: ${f.evidence.firstLine}`);

if (commit) {
  if (high.length) { console.error(`\n✗ refusing to commit lexicon — ${high.length} HIGH finding(s) unresolved.`); process.exit(1); }
  const next = {
    ...lexicon,
    videos: [...new Set([...(lexicon.videos || []), id])],
    words: [...new Set([...(lexicon.words || []), ...vocabWords])].sort(),
    phrases: [...new Set([...(lexicon.phrases || []), ...glossed])].sort(),
    allow: lexicon.allow || ['bravo'],
  };
  await writeJson(P.lexicon, next);
  console.log(`\n✓ committed to state/lexicon.json — +${vocabWords.size} words, now ${next.words.length} cumulative across ${next.videos.length} video(s).`);
}

process.exit(high.length ? 3 : 0); // non-zero on HIGH so the render step can block
