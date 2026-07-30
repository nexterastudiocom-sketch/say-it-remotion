#!/usr/bin/env node
// Expanding-interval spacing engine (method v2 §4.7).
//
// Schedules each item's RECALL appearances across the lesson's response-slot
// timeline so recall is graduated, not massed: a short opening cluster, then a
// wider cluster, then ONE long "forgetting gap" (>= forget_gap slots) that forces
// retrieval near the edge of forgetting, then a re-cluster. Core items must reach
// core_occurrences and carry at least one gap >= forget_gap; every item appears at
// least min_occurrences times.
//
//   node scripts/qa/spacing.mjs <workbook.xlsx>     # print the item x slot table
//
// Exported for the author: scheduleItems(), validateSchedule(), spacingTable().

// Per-item gap templates (slot-index deltas between successive appearances).
// The sequence itself is the expanding interval: small -> medium -> forgetting -> medium.
const TEMPLATES = {
  // 9 appearances, one long forgetting gap, re-cluster after it. The forgetting
  // gap carries margin over forget_gap(40) so minimal-displacement collision
  // resolution can't compress it below the floor.
  core: [2, 3, 7, 10, 50, 7, 10, 13],
  // 4 appearances, one long forgetting gap.
  regular: [3, 9, 50],
};

export const SPACING_SPEC = {
  min_occurrences: 3,
  core_occurrences: [7, 13],
  forget_gap: 40,
  intro_stagger: 2, // slots between successive items' first appearance
};

// items: [{ ref, core }]  (order = teaching order)
// Returns { slots, schedule: [{slot, ref, appearance, kind}], perItem: {ref:{slots,gaps,maxGap,count}} }
export function scheduleItems(items, spec = SPACING_SPEC) {
  const raw = []; // {slot, ref, appearance}
  items.forEach((it, k) => {
    const tmpl = it.core ? TEMPLATES.core : TEMPLATES.regular;
    let slot = 1 + k * spec.intro_stagger; // staggered intro
    raw.push({ ref: it.ref, slot, appearance: 0 });
    tmpl.forEach((gap, gi) => {
      slot += gap;
      raw.push({ ref: it.ref, slot, appearance: gi + 1 });
    });
  });

  // Resolve collisions by MINIMAL DISPLACEMENT: keep each appearance at its
  // template slot when free, else push to the nearest free slot. Unlike dense
  // renumbering this preserves the large forgetting gaps (both endpoints sit in
  // dense clusters and shift the same direction, so the gap survives).
  raw.sort((a, b) => a.slot - b.slot || a.ref.localeCompare(b.ref));
  const used = new Set();
  const schedule = raw.map((r) => {
    let s = r.slot;
    while (used.has(s)) s++;
    used.add(s);
    return { slot: s, ref: r.ref, appearance: r.appearance, kind: r.appearance === 0 ? 'intro' : 'recall' };
  });
  // Repair pass — GUARANTEE the forgetting gap. Collision resolution in the dense
  // re-cluster region can compress a core item's long gap below forget_gap; if so,
  // push every appearance at/after the gap's far end later by the shortfall (this
  // only grows the timeline slightly and can't break any other item's gap, since
  // shifting appearances later never shrinks an earlier gap).
  const occupied = new Set(schedule.map((x) => x.slot));
  const shiftFrom = (fromSlot, by) => {
    for (const x of schedule) if (x.slot >= fromSlot) { occupied.delete(x.slot); }
    for (const x of schedule) if (x.slot >= fromSlot) { x.slot += by; occupied.add(x.slot); }
  };
  for (const it of items.filter((i) => i.core)) {
    let guard = 0;
    while (guard++ < 20) {
      const s = schedule.filter((x) => x.ref === it.ref).map((x) => x.slot).sort((a, b) => a - b);
      const gaps = s.slice(1).map((v, i) => v - s[i]);
      const maxGap = gaps.length ? Math.max(...gaps) : 0;
      if (maxGap >= spec.forget_gap) break;
      // widen this item's largest gap by pushing everything from its far endpoint on.
      const gi = gaps.indexOf(maxGap);
      const farEnd = s[gi + 1];
      shiftFrom(farEnd, spec.forget_gap - maxGap + 2);
    }
  }
  const cursor = Math.max(...schedule.map((x) => x.slot));

  // Per-item stats on the RESOLVED slots.
  const perItem = {};
  for (const it of items) {
    const s = schedule.filter((x) => x.ref === it.ref).map((x) => x.slot).sort((a, b) => a - b);
    const gaps = s.slice(1).map((v, i) => v - s[i]);
    perItem[it.ref] = { slots: s, gaps, maxGap: gaps.length ? Math.max(...gaps) : 0, count: s.length, core: !!it.core };
  }
  return { slots: cursor, schedule, perItem };
}

// Hard-fail rules (method v2 §5.1). Returns { ok, violations:[...] }.
export function validateSchedule(sched, items, spec = SPACING_SPEC) {
  const v = [];
  const [loCore, hiCore] = spec.core_occurrences;
  for (const it of items) {
    const p = sched.perItem[it.ref];
    if (!p || p.count < spec.min_occurrences) v.push(`${it.ref}: ${p ? p.count : 0} occurrences (< ${spec.min_occurrences})`);
    if (it.core) {
      if (p.count < loCore || p.count > hiCore) v.push(`${it.ref}: core item has ${p.count} occurrences (want ${loCore}-${hiCore})`);
      if (p.maxGap < spec.forget_gap) v.push(`${it.ref}: core item max gap ${p.maxGap} (< ${spec.forget_gap} forgetting gap)`);
    }
  }
  return { ok: v.length === 0, violations: v };
}

// The item x slot table for the QA report (method v2 §5.1: "emit the spacing table").
export function spacingTable(sched, items) {
  const lines = [];
  for (const it of items) {
    const p = sched.perItem[it.ref];
    const marks = p.slots.map((s, i) => (i === 0 ? `@${s}` : `+${s - p.slots[i - 1]}`)).join(' ');
    lines.push(`${(it.core ? '★' : ' ')} ${it.ref.padEnd(18)} n=${String(p.count).padStart(2)} gapMax=${String(p.maxGap).padStart(2)}  ${marks}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const wbPath = process.argv[2];
  let items;
  if (wbPath) {
    const XLSX = (await import('xlsx')).default;
    const wb = XLSX.readFile(wbPath);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Items'], { defval: '' }).filter((r) => r.fr);
    // core = the items the lesson leans on: heuristic here = target_level >= 3 OR chunked.
    items = rows.map((r) => ({ ref: String(r.fr).replace(/\([^)]*\)/g, '').trim(), core: (Number(String(r.target_level).replace(/\D/g, '')) || 3) >= 4 }));
  } else {
    items = [
      { ref: 'bonjour', core: true }, { ref: 'au revoir', core: true }, { ref: 'merci', core: false },
      { ref: 'oui', core: false }, { ref: 'non', core: false }, { ref: 'madame', core: true },
    ];
  }
  const sched = scheduleItems(items);
  console.log(`\nEXPANDING-INTERVAL SCHEDULE — ${items.length} items → ${sched.slots} response slots\n`);
  console.log(spacingTable(sched, items));
  const val = validateSchedule(sched, items);
  console.log(`\n${val.ok ? '✓ schedule valid' : '✗ violations:\n  ' + val.violations.join('\n  ')}`);
}
