// Shared image-registry binding (Command 6). Resolves each slide/beat to its
// registry image so the render can show it. Identity is a lookup, never a guess
// (I-10). Only renderable-status images attach (I-11): 'approved' always,
// 'generated' too unless strict. Missing files fall back to the typographic card.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const sslug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export async function bindImages(slides, lessonNum, ROOT, { strict = false } = {}) {
  const regPath = path.join(ROOT, 'assets/images/registry.json');
  const reg = existsSync(regPath) ? JSON.parse(await readFile(regPath, 'utf8')) : { items: {}, scenes: {} };
  const RENDERABLE = strict ? new Set(['approved']) : new Set(['approved', 'generated']);
  const Lkey = `L${String(lessonNum).padStart(2, '0')}`;
  const fileOf = (e) => (e && RENDERABLE.has(e.status) && existsSync(path.join(ROOT, 'public', e.file)) ? e.file : null);
  const itemImg = (fr) => fileOf(reg.items[fr]);
  const sceneImg = (setting) => fileOf(reg.scenes[`${Lkey}_${sslug(setting)}`]);

  // `wantsImage` marks a slot that SHOULD carry an illustration; when the file
  // isn't generated yet the render shows a "No-Credit" placeholder there instead
  // of silently dropping to the typographic card, so gaps are visible.
  let bound = 0, wanted = 0, scenarioSeen = 0;
  for (const s of slides) {
    if (s.stage === 'ITEM_BLOCK') {
      const fr = String(s.segment).split('·').pop().trim();
      s.wantsImage = true; s.item = fr; wanted++;
      const f = itemImg(fr);
      if (f) { s.imageSrc = f; s.imageId = reg.items[fr].image_id; bound++; }
    } else if (s.stage === 'MICRO_RECALL') {
      for (const b of s.beats || []) if (b.voice && b.voice.startsWith('fr')) { b.wantsImage = true; wanted++; const f = itemImg(b.text); if (f) { b.imageSrc = f; bound++; } }
    } else if (s.stage === 'COLD_INPUT' || s.stage === 'INPUT_RETURN') {
      s.wantsImage = true; wanted++;
      const f = sceneImg('cold_dialogue'); if (f) { s.imageSrc = f; bound++; }
    } else if (s.stage === 'TRANSFER_TASK') {
      s.wantsImage = true; wanted++;
      const f = sceneImg('transfer'); if (f) { s.imageSrc = f; bound++; }
    } else if (s.stage === 'MAKE_IT_YOURS') {
      for (const b of s.beats || []) {
        if (b.voice && b.voice.startsWith('en') && b.level === 4 && /say it out loud|say your reply/i.test(b.text || '')) scenarioSeen++;
        if (b.voice) { b.wantsImage = true; wanted++; const f = sceneImg(`scenario_${scenarioSeen}`); if (f) { b.imageSrc = f; bound++; } }
      }
    }
  }
  return { bound, wanted };
}
