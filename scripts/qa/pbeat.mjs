#!/usr/bin/env node
// P(beat) — the Say It Method pause algorithm (Method spec Part VII).
// Pauses are COMPUTED, never chosen by feel. The generator/author uses this to
// set every production pause so Gate A rule P-03 passes.
//
//   import { estAudio, pBeat, frSyllables } from './pbeat.mjs'
//   node scripts/qa/pbeat.mjs --test               # self-check vs spec values
//   node scripts/qa/pbeat.mjs produce_meaning "Bonjour, madame."   # compute one
import { rules } from './gateb.mjs';

const FR_VOWELS = new Set('aeiouyàâäéèêëîïôöùûüÿœæ');
export function frSyllables(text) {
  let t = (text || '').toLowerCase().replace(/[^a-zà-öø-ÿ'’\s]/g, ' ').replace(/['’]/g, ' ');
  let total = 0;
  for (const w of t.split(/\s+/).filter(Boolean)) {
    let g = 0, prev = false;
    for (const ch of w) { const v = FR_VOWELS.has(ch); if (v && !prev) g++; prev = v; }
    if (g > 1) { if (w.endsWith('es') && !FR_VOWELS.has(w[w.length - 3])) g--; else if (w.endsWith('e') && !FR_VOWELS.has(w[w.length - 2])) g--; }
    total += Math.max(1, g);
  }
  return Math.max(1, total);
}

export async function timing() { return (await rules()).timing; }

export function estAudio(text, rate, cfg) {
  const f = cfg.rate_factor[rate || 'natural'] ?? 1.0;
  return frSyllables(text) * cfg.syllable_seconds * f;
}

// role ∈ copy|read_aloud|produce_meaning|produce_situation|produce_cold|written|
//        en_instruction|note|confirm|fluency
// targetText = what the LEARNER must say (the FR the pause is for).
export function pBeat(role, targetText, cfg, opts = {}) {
  if (role === 'en_instruction') return cfg.en_instruction_max;      // ≤1.2s
  if (role === 'note') return cfg.note_pause;                        // 1.2s
  if (role === 'confirm') return cfg.confirm_pause_range[1];         // ≤1.2s
  if (role === 'written') return cfg.written_pause;                  // 12s
  if (role === 'fluency') { const m = cfg.fluency_multipliers[Math.min(3, opts.pass || 1) - 1]; return +(m * estAudio(targetText, 'natural', cfg)).toFixed(2); }
  const floor = cfg.pause_floor[role], mult = cfg.pause_multiplier[role];
  if (floor == null) throw new Error(`unknown production role: ${role}`);
  return +Math.max(floor, mult * estAudio(targetText, 'natural', cfg)).toFixed(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = await timing();
  if (process.argv.includes('--test')) {
    const cases = [
      ['syllables Bonjour', frSyllables('Bonjour'), 2],
      ['syllables madame', frSyllables('madame'), 2],
      ['syllables au revoir', frSyllables('au revoir'), 3],
      // P(copy) for "Bonjour" (2 syl): max(1.5, 2.0×(2×0.3)) = max(1.5,1.2)=1.5
      ['P(copy) Bonjour', pBeat('copy', 'Bonjour', cfg), 1.5],
      // P(produce_meaning) "Bonjour, madame." (4 syl): max(2.5, 3.0×(4×0.3))=max(2.5,3.6)=3.6
      ['P(produce_meaning) "Bonjour, madame."', pBeat('produce_meaning', 'Bonjour, madame.', cfg), 3.6],
      ['P(en_instruction)', pBeat('en_instruction', '', cfg), 1.2],
      ['P(written)', pBeat('written', '', cfg), 12],
    ];
    let ok = 0;
    for (const [name, got, want] of cases) { const pass = Math.abs(got - want) < 0.01; console.log(`  ${pass ? '✓' : '✗'} ${name} = ${got} (want ${want})`); if (pass) ok++; }
    console.log(`\n  ${ok}/${cases.length} P(beat) checks pass`);
    process.exit(ok === cases.length ? 0 : 1);
  }
  const [role, text] = process.argv.slice(2);
  console.log(`P(${role}) for "${text || ''}" = ${pBeat(role, text || '', cfg)}s  (${frSyllables(text || '')} syllables)`);
}
