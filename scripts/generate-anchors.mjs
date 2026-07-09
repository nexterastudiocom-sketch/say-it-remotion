// Generate style-reference candidates with Recraft's base illustration style,
// for you to hand-pick (up to 5) and turn into a reusable custom style.
//
// Usage:  npm run images:anchors      (needs RECRAFT_API_TOKEN in .env)
// Output: scripts/style-references/    → review, keep your 3–5 favorites, then:
//         npm run images:style -- scripts/style-references/<pick1>.png <pick2>.png ...

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from './recraft-client.mjs';
import { STYLE_DESCRIPTOR, ANCHOR_PROMPTS } from './style-lock.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts/style-references');
const BASE_STYLE = process.env.RECRAFT_STYLE || 'digital_illustration';

const download = async (url, file) => writeFile(file, Buffer.from(await (await fetch(url)).arrayBuffer()));

await mkdir(OUT, { recursive: true });
for (const [i, prompt] of ANCHOR_PROMPTS.entries()) {
  console.log(`[${i + 1}/${ANCHOR_PROMPTS.length}] ${prompt}`);
  try {
    const [url] = await generateImage({
      prompt: `${prompt}. ${STYLE_DESCRIPTOR}`,
      style: BASE_STYLE,
      size: '1024x1024',
      n: 1,
    });
    const name = `ref-${String(i + 1).padStart(2, '0')}.png`;
    await download(url, path.join(OUT, name));
    console.log(`  saved ${name}`);
  } catch (err) {
    console.error(`  failed: ${err.message}`);
  }
}
console.log(`\nDone. Review ${path.relative(ROOT, OUT)}, then create a style from your favorites:\n  npm run images:style -- ${path.relative(ROOT, OUT)}/ref-01.png ${path.relative(ROOT, OUT)}/ref-04.png`);
