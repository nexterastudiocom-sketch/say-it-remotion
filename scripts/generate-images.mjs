// Generate the per-segment images for a lesson (language-agnostic — one image
// set is reused across all five languages). Reads scene descriptions, calls
// Recraft, saves images, and writes the image manifest the template reads.
//
// Usage:  npm run images            # lesson-04
//         npm run images -- lesson-07
//
// Reads   src/data/images/scenes.<lessonId>.json  ({segments:[{id,scene}]})
// Writes  public/assets/images/<lessonId>_<id>.png
//         src/data/images/manifest.json  ({segments:{id:{imageSrc}}})
//
// If RECRAFT_STYLE_ID is set → uses your custom style (locked look).
// If not → uses the base RECRAFT_STYLE + STYLE_DESCRIPTOR (works right away).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from './recraft-client.mjs';
import { STYLE_DESCRIPTOR } from './style-lock.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON = process.argv[2] || 'lesson-04';
const styleId = process.env.RECRAFT_STYLE_ID || '82b9cd4a-3c6b-423b-a100-410c3c22d392'; // locked house style (built-in default)
const baseStyle = process.env.RECRAFT_STYLE || 'digital_illustration';

const scenesPath = path.join(ROOT, 'src/data/images', `scenes.${LESSON}.json`);
if (!existsSync(scenesPath)) {
  console.error(`✗ No scenes file: ${path.relative(ROOT, scenesPath)}`);
  process.exit(1);
}
const scenes = JSON.parse(await readFile(scenesPath, 'utf8'));

const manifestPath = path.join(ROOT, 'src/data/images', 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { segments: {} };
manifest.segments ??= {};

await mkdir(path.join(ROOT, 'public/assets/images'), { recursive: true });
console.log(`▶ ${LESSON}  (${styleId ? `custom style ${styleId}` : `base style "${baseStyle}" + style lock`})`);

for (const seg of scenes.segments) {
  // A segment may define one `scene` or several `scenes` (shown together).
  const sceneList = seg.scenes?.length ? seg.scenes : [seg.scene];
  const rels = [];
  for (let i = 0; i < sceneList.length; i++) {
    process.stdout.write(`  · ${seg.id}${sceneList.length > 1 ? ` [${i + 1}/${sceneList.length}]` : ''}: `);
    const scene = sceneList[i];
    const prompt = styleId ? scene : `${scene}. ${STYLE_DESCRIPTOR}`;
    const suffix = sceneList.length > 1 ? `_${i + 1}` : '';
    try {
      const [url] = await generateImage({ prompt, style: styleId ? undefined : baseStyle, styleId, size: '1024x1024', n: 1 });
      const rel = `assets/images/${LESSON}_${seg.id}${suffix}.png`;
      await writeFile(path.join(ROOT, 'public', rel), Buffer.from(await (await fetch(url)).arrayBuffer()));
      rels.push(rel);
      console.log(`saved ${rel}`);
    } catch (err) {
      console.error(`failed — ${err.message}`);
    }
  }
  if (rels.length) manifest.segments[seg.id] = { imageSrc: rels[0], imageSrcs: rels };
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`  ✓ wrote ${path.relative(ROOT, manifestPath)}`);
console.log('\nReload Remotion studio (or re-render) to see the images in the slides.');
