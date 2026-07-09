// report.mjs — result plumbing + the final console/JSON report and CI gate.
// Deliberately pytest-shaped: every check is a { name, status, detail }.

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const WARN = 'WARN';
export const SKIP = 'SKIP';

// Build one check result. `extra` carries structured data into the JSON report
// (e.g. measured numbers, per-slide vision sub-checks) without cluttering the
// one-line console detail.
export function result(name, status, detail = '', extra = {}) {
  return { name, status, detail, ...extra };
}

const ICON = { PASS: '✓', FAIL: '✗', WARN: '!', SKIP: '·' };

function line(r) {
  const ts = r.timestamp != null ? ` @ ${r.timestamp.toFixed(1)}s` : '';
  return `  ${ICON[r.status] || '?'} [${r.status.padEnd(4)}] ${r.name}${ts} — ${r.detail}`;
}

export function renderReport(results, title = 'QC Report') {
  const bar = '='.repeat(title.length);
  const lines = [title, bar];

  // Group by the layer tag the orchestrator stamps on each result.
  const order = ['technical', 'script', 'audio', 'vision'];
  const labels = {
    technical: 'Layer 1 · Technical (ffmpeg — exact)',
    script: 'Layer 2 · Script fidelity (text — exact)',
    audio: 'Layer 2b · Audio diff (whisper)',
    vision: 'Layer 3 · Vision (Claude — judgment)',
  };
  const byLayer = new Map();
  for (const r of results) {
    const k = r.layer || 'other';
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k).push(r);
  }
  for (const k of [...order, ...[...byLayer.keys()].filter((x) => !order.includes(x))]) {
    const group = byLayer.get(k);
    if (!group?.length) continue;
    lines.push('', labels[k] || k);
    group.forEach((r) => lines.push(line(r)));
  }

  const n = (s) => results.filter((r) => r.status === s).length;
  const nFail = n(FAIL); const nWarn = n(WARN); const nPass = n(PASS); const nSkip = n(SKIP);
  const gate = nFail
    ? 'BOUNCE — fix the FAILs above, do not route to human review yet'
    : nWarn
      ? 'PASS WITH WARNINGS — a human should spot-check the flagged items'
      : 'PASS — ready for human sign-off';
  lines.push('', '-'.repeat(title.length));
  lines.push(`${nPass} passed · ${nWarn} warned · ${nFail} failed · ${nSkip} skipped   ->   ${gate}`);
  return lines.join('\n');
}

// Exit 1 if anything failed, else 0 — wire straight into a CI gate.
export function exitCode(results) {
  return results.some((r) => r.status === FAIL) ? 1 : 0;
}
