#!/usr/bin/env node
// GATE A — Say It Method, all 55 pre-render rules (layers L0 + L4).
//
//   node scripts/qa/gate-a.mjs <video-id> [--promote-lexicon] [--transcript <path>]
//
// Thin wrapper around the reference engine qa/say_it_qc.py: it loads the 69-rule
// registry (qa/say_it_rules.yaml), parses the lesson transcript to the Method
// grammar, runs every Gate-A rule, and writes qa/<id>.json in the shared schema
// {gate, rule, severity, layer, line, issue, evidence, suggested_fix}. Exit 1 on
// any BLOCK so the render step can gate. --promote-lexicon appends this lesson's
// items to state/lexicon.json, but ONLY when Gate A passes (the engine enforces it).

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PY = process.env.QA_PY || path.join(ROOT, '.venv-ocr/bin/python');
const QC = path.join(ROOT, 'qa/say_it_qc.py');
const RULES = path.join(ROOT, 'qa/say_it_rules.yaml');
const LEXICON = path.join(ROOT, 'state/lexicon.json');

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) || 'lesson-01';
const promote = args.includes('--promote-lexicon');
// Transcript: --transcript <path>, else the Method-grammar lesson, else the golden.
const flagT = args.indexOf('--transcript');
const candidates = flagT >= 0 ? [args[flagT + 1]] : [
  `lessons/${id}.md`, `curriculum/${id}.md`, `lessons/golden/${id.replace('-', '_')}.md`,
];
const transcript = candidates.map((c) => path.join(ROOT, c)).find(existsSync);
if (!transcript) { console.error(`✗ no Method-grammar transcript for ${id}. Looked for:\n  ${candidates.join('\n  ')}`); process.exit(2); }
if (!existsSync(PY)) { console.error(`✗ QA python not found (${PY}). Needs pyyaml — see scripts/qa/README.`); process.exit(2); }

const out = path.join(ROOT, `qa/${id}.json`);
const qcArgs = [QC, transcript, '--rules', RULES, '--curriculum', LEXICON, '--json', out];
if (promote) qcArgs.push('--promote-lexicon');

try {
  execFileSync(PY, qcArgs, { stdio: 'inherit', cwd: ROOT });
  process.exit(0); // engine exited 0 → no BLOCK
} catch (e) {
  process.exit(e.status ?? 1); // engine exits 1 on any BLOCK
}
