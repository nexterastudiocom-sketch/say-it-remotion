// Shared Gate B helpers: rule metadata from say_it_rules.yaml, engine-schema
// findings, and merging into the same qa/<id>.json that Gate A (say_it_qc.py)
// writes. Gate B stays deterministic; findings match {gate, rule, severity,
// layer, line, issue, evidence, suggested_fix}.

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { paths, readJson, writeJson, run, ROOT } from './lib.mjs';

const QA_PY = process.env.QA_PY || path.join(ROOT, '.venv-ocr/bin/python');
let _rules = null;

// Load the whole rule registry as JSON (via pyyaml — no Node YAML dep).
export async function rules() {
  if (_rules) return _rules;
  const r = await run(QA_PY, ['-c',
    'import yaml,json,sys; print(json.dumps(yaml.safe_load(open("qa/say_it_rules.yaml"))))']);
  if (r.code !== 0) throw new Error('could not load say_it_rules.yaml (pyyaml missing?): ' + r.stderr.trim());
  const y = JSON.parse(r.stdout);
  y._byId = Object.fromEntries((y.rules || []).map((x) => [x.id, x]));
  _rules = y;
  return y;
}

export function meta(y, id) {
  const r = y._byId[id] || {};
  return { severity: r.severity || 'WARN', layer: r.layer || 'L1', fix: r.fix || '' };
}

// Build a finding in the engine schema. `id` is a rule id; metadata comes from YAML.
export function finding(y, id, line, issue, evidence) {
  const m = meta(y, id);
  return { gate: 'B', rule: id, severity: m.severity, layer: m.layer,
    line: line || 0, issue, evidence: evidence ?? '', suggested_fix: m.fix };
}

// Merge this pass's findings into qa/<id>.json, replacing only the rules it owns
// so each check stays independently runnable without clobbering the others.
export async function merge(id, ownedRuleIds, findings, stats = {}) {
  const P = paths(id);
  const doc = { video_id: id, meta: {}, stats: {}, findings: [] };
  if (existsSync(P.qa)) {
    try {
      const raw = await readJson(P.qa);
      if (Array.isArray(raw)) doc.findings = raw.filter((f) => f && f.rule); // legacy array shape
      else if (raw && typeof raw === 'object') Object.assign(doc, raw, { findings: Array.isArray(raw.findings) ? raw.findings : [] });
    } catch { /* keep default */ }
  }
  const owned = new Set(ownedRuleIds);
  doc.findings = doc.findings.filter((f) => !owned.has(f.rule)).concat(findings);
  doc.stats = { ...(doc.stats || {}), ...stats };
  doc.findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  await writeJson(P.qa, doc);
  return doc;
}

// allowed_set(n): union of items from lessons 1..n in state/lexicon.json, plus
// this lesson's own front-matter items (if a Method-grammar transcript exists).
export async function allowedSet(id) {
  const P = paths(id);
  const set = new Set();
  if (existsSync(P.lexicon)) {
    const lx = await readJson(P.lexicon);
    const n = Number(String(id).replace(/\D/g, '')) || 1;
    for (const [k, items] of Object.entries(lx.lessons || {})) {
      if (Number(k) <= n) for (const it of items || []) set.add(it);
    }
  }
  // this lesson's items from the transcript front matter
  const tPaths = [`lessons/${id}.md`, `curriculum/${id}.md`, `lessons/golden/${id.replace('-', '_')}.md`];
  for (const rel of tPaths) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) continue;
    const r = await run(QA_PY, ['-c',
      `import yaml,sys,json;raw=open(${JSON.stringify(abs)}).read();p=raw.lstrip().split("---",2);` +
      `m=yaml.safe_load(p[1]) if len(p)>=3 else {};print(json.dumps((m or {}).get("items",[])))`]);
    if (r.code === 0) { try { for (const it of JSON.parse(r.stdout)) set.add(it); } catch {} }
    break;
  }
  return set;
}

export const videoMtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
