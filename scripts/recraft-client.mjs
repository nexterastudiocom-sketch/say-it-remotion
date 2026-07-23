// Recraft image API client (individual-friendly, no enterprise license).
// Verified against current docs (July 2026):
//   POST https://external.api.recraft.ai/v1/images/generations
//     body { prompt, model, size, n, style | style_id } → { data: [{ url }] }
//   POST https://external.api.recraft.ai/v1/styles  (multipart)
//     style=<base> + file1..file5 (refs) → { id }   ← the consistency trick
//
// Token comes from .env (loaded via `node --env-file=.env`). Never hard-code it.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://external.api.recraft.ai/v1';

const token = () => {
  const t = process.env.RECRAFT_API_TOKEN;
  if (!t) throw new Error('Missing RECRAFT_API_TOKEN — add your Recraft API key to .env (recraft.ai → profile → API). The style is built in; only this paid key is per-machine.');
  return t;
};

/** Generate image(s); returns output URLs (data[].url). Prefer styleId (a
 *  trained custom style) for consistency; otherwise a base `style` is used. */
export async function generateImage({ prompt, model = 'recraftv3', style, substyle, styleId, size = '1024x1024', n = 1 }) {
  const body = { prompt, model, size, n };
  if (styleId) body.style_id = styleId;
  else if (style) {
    body.style = style;
    if (substyle) body.substyle = substyle;
  }

  const res = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Recraft generate failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d) => d.url);
}

/** Create a reusable custom style from 1–5 reference images; returns its id. */
export async function createStyle({ baseStyle = 'digital_illustration', files, model = 'recraftv3' }) {
  const form = new FormData();
  form.append('style', baseStyle);
  form.append('model', model);
  for (let i = 0; i < files.length; i++) {
    const buf = await readFile(files[i]);
    form.append(`file${i + 1}`, new Blob([buf]), path.basename(files[i]));
  }
  const res = await fetch(`${BASE}/styles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Recraft create-style failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}
