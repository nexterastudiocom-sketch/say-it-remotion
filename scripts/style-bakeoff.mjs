// One-off: variations blending 3D + gouache (from more-3D to more-painterly).
// Saves to out/blend-round/. Usage: node --env-file=.env scripts/style-bakeoff.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out/blend-round');
const TOKEN = process.env.RECRAFT_API_TOKEN;
const SCENE = 'a person cooking at a stove, stirring a pot with steam rising, cozy kitchen';
const BASE = 'colorful, beautiful, clearly showing the action';

// {label, style, substyle, extra, styleId}
const CANDIDATES = [
  { label: 'A-pixar-gouache', style: 'realistic_image', extra: '3D Pixar-style animated render blended with painterly gouache textures, warm vibrant colors, soft cinematic lighting' },
  { label: 'B-3d-matte', style: 'digital_illustration', extra: 'stylized 3D render with a matte painterly gouache finish, dimensional depth, vibrant' },
  { label: 'C-current-blend', styleId: 'd8508d62-7aa0-4c49-a422-8505837dd8d4', extra: '' },
  { label: 'D-cinematic', style: 'realistic_image', extra: 'cinematic 3D animation still, painterly gouache brushwork, Pixar meets watercolor, vibrant' },
  { label: 'E-storybook3d', style: 'digital_illustration', extra: '3D storybook illustration, soft rounded shapes, gouache texture, warm colorful, dimensional depth' },
  { label: 'F-claymation-warm', style: 'digital_illustration', substyle: 'handmade_3d', extra: 'warm vibrant colors, painterly, cozy' },
];

async function gen(c) {
  const prompt = `${SCENE}. ${c.extra ? c.extra + ', ' : ''}${BASE}`;
  const body = { prompt, model: 'recraftv3', size: '1024x1024', n: 1 };
  if (c.styleId) body.style_id = c.styleId;
  else { body.style = c.style; if (c.substyle) body.substyle = c.substyle; }
  const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 100)}`);
  return (await res.json()).data[0].url;
}

await mkdir(OUT, { recursive: true });
for (const c of CANDIDATES) {
  process.stdout.write(`  · ${c.label}: `);
  try {
    const url = await gen(c);
    await writeFile(path.join(OUT, `${c.label}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log('ok');
  } catch (e) {
    console.log(`skip (${e.message})`);
  }
}
console.log(`\nDone → ${path.relative(ROOT, OUT)}`);
