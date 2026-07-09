// Dump the workbook's structure: sheet names, headers, and a few sample rows.
import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(ROOT, 'curriculum/Say_It_A1_French_Curriculum.xlsx');
const wb = XLSX.readFile(file);

console.log(`Workbook: ${path.basename(file)}`);
console.log(`Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}\n`);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  console.log(`==================== ${name} (${rows.length} rows) ====================`);
  rows.slice(0, 6).forEach((r, i) => {
    const cells = r.map((c) => String(c).replace(/\s+/g, ' ').slice(0, 40));
    console.log(`  [${i}] ${JSON.stringify(cells)}`);
  });
  console.log('');
}
