// Create a reusable Recraft custom style from 1–5 reference images, so every
// generated image shares the same locked look (the consistency mechanism).
//
// Usage:  npm run images:style -- <img1> <img2> ...   (1–5 images)
// Prints a style_id — paste it into .env as RECRAFT_STYLE_ID, then `npm run images`.

import { createStyle } from './recraft-client.mjs';

const files = process.argv.slice(2);
if (files.length < 1 || files.length > 5) {
  console.error('Usage: npm run images:style -- <img1> [img2 ... up to 5]');
  process.exit(1);
}
const baseStyle = process.env.RECRAFT_STYLE || 'digital_illustration';
console.log(`Creating "${baseStyle}" style from ${files.length} image(s)…`);
const id = await createStyle({ baseStyle, files });
console.log(`\n✓ style_id: ${id}\n\nAdd this to .env:\n  RECRAFT_STYLE_ID=${id}\n\nThen run:  npm run images`);
