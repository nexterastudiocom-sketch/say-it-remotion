// Generate varied references in the chosen look, to seed a Recraft custom style.
// Varied subjects + rich colors → a style that shows the action beautifully and
// isn't locked to one hue. Saves to scripts/style-references/. (≤3 refs keeps the
// combined upload under Recraft's 5MB create-style cap.)
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from './recraft-client.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts/style-references');
const STYLE = process.env.RECRAFT_STYLE || 'digital_illustration';
const SUBSTYLE = process.env.RECRAFT_SUBSTYLE || 'child_book';
const SUFFIX = 'warm colorful storybook illustration, rich vibrant colors, soft natural light, beautiful, detailed, clearly showing the action';

const SUBJECTS = [
  'a person cooking at a stove, stirring a pot, steam rising',
  'two friends talking and laughing at a café table with coffee',
  'a person riding a bicycle down a sunny street',
];

await mkdir(OUT, { recursive: true });
for (const [i, subject] of SUBJECTS.entries()) {
  process.stdout.write(`  · story-ref-${i + 1}: `);
  try {
    const [url] = await generateImage({ prompt: `${subject}. ${SUFFIX}`, style: STYLE, substyle: SUBSTYLE, size: '1024x1024', n: 1 });
    const name = `story-ref-${String(i + 1).padStart(2, '0')}.png`;
    await writeFile(path.join(OUT, name), Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log(`saved ${name}`);
  } catch (e) {
    console.log(`failed — ${e.message.slice(0, 80)}`);
  }
}
console.log(`\nDone → ${path.relative(ROOT, OUT)}`);
