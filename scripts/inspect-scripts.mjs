import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const wb = XLSX.readFile(path.join(ROOT, 'curriculum/Say_It_A1_French_Curriculum.xlsx'));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['4 · Lesson Scripts'], { defval: '' });

// Distinct segment types + counts
const types = {};
for (const r of rows) { const s = String(r['Segment'] || '').trim(); if (s) types[s] = (types[s] || 0) + 1; }
console.log('SEGMENT TYPES:', JSON.stringify(types, null, 0), '\n');

// Full Lesson 1
console.log('===== FULL L1 =====');
for (const r of rows.filter((r) => String(r['Lesson']).trim() === 'L1')) {
  console.log(JSON.stringify({
    n: r['#'], seg: r['Segment'], fr: r['Card text (FR)'], en: r['English'],
    pron: r['Pronunciation'], narr: r['Narration / on-screen cue'], img: r['Image idea (Firefly)'],
  }));
}

// Lesson Map row for L1..L2
console.log('\n===== LESSON MAP (first 2) =====');
const map = XLSX.utils.sheet_to_json(wb.Sheets['2 · Lesson Map'], { defval: '' });
map.slice(0, 2).forEach((r) => console.log(JSON.stringify(r)));
