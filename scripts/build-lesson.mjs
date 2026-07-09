// Workbook → full baked lesson JSON.
//
// Reads the "Lesson Scripts" sheet for one lesson, maps each row to a template
// slide, then (with API keys present) generates ElevenLabs narration — setting
// each slide's duration from the ACTUAL audio length — and Recraft images, and
// writes a self-contained lesson file the template renders directly.
//
// Usage:  npm run lesson -- 1        # build lesson 1 (French)
//         npm run lesson -- 1 --no-media   # structure only, skip audio/images
//
// Writes  src/data/lessons/lesson-01.fr.json   (baked: durations, audioSrc, imageSrc)
//         public/assets/audio/lesson-01/fr/*.mp3
//         public/assets/images/lesson-01_*.png

import XLSX from 'xlsx';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from './recraft-client.mjs';
import { synthSegment, cleanup, nativeVoice, hasElevenKey } from './lib/eleven.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion');
const TAIL_PAD = 0.6;
const LANG = 'fr';
const WORKBOOK = path.join(ROOT, 'curriculum/Say_It_A1_French_Curriculum.xlsx');

const args = process.argv.slice(2);
const lessonNum = Number(args.find((a) => /^\d+$/.test(a)) || 1);
const noMedia = args.includes('--no-media');
const forceImages = args.includes('--force-images'); // by default, keep locked images
const LKEY = `L${lessonNum}`;
const LID = `lesson-${String(lessonNum).padStart(2, '0')}`;
const styleId = process.env.RECRAFT_STYLE_ID || undefined;

// ---- read workbook -------------------------------------------------------
const wb = XLSX.readFile(WORKBOOK);
const scripts = XLSX.utils.sheet_to_json(wb.Sheets['4 · Lesson Scripts'], { defval: '' });
const map = XLSX.utils.sheet_to_json(wb.Sheets['2 · Lesson Map'], { defval: '' }).find((r) => Number(r['Lesson']) === lessonNum);
const spine = XLSX.utils.sheet_to_json(wb.Sheets['1 · A1 Spine'], { defval: '' });
const posOf = new Map(spine.map((r) => [String(r['French']).trim(), String(r['Type']).trim()]));

const rows = scripts.filter((r) => String(r['Lesson']).trim() === LKEY && String(r['Segment']).trim());
if (!rows.length) throw new Error(`No rows for ${LKEY} in Lesson Scripts`);

const F = (r) => String(r['Card text (FR)']).trim();
const EN = (r) => String(r['English']).trim();
const PRON = (r) => String(r['Pronunciation']).trim();
const NARR = (r) => String(r['Narration / on-screen cue']).trim();
const IMG = (r) => String(r['Image idea (Firefly)']).trim();

// ---- build slides + narration + scenes -----------------------------------
const slides = [];
const narration = []; // { id, parts:[{text,voice}], minSeconds? }
const scenes = []; // { id, scene }  (title + words get an image)
let wc = 0; // per-type counter for stable ids
const words = []; // collected for recap

const id = (t) => `${t}-${++wc}`;
const enPart = (r) => (EN(r) ? [{ text: `In English: ${EN(r)}`, voice: 'en' }] : []);

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const seg = String(r['Segment']).trim();

  if (seg === 'GOAL') {
    const sid = 'title';
    const [kicker, title] = F(r).includes(':') ? F(r).split(/\s*:\s*/) : [`Leçon ${lessonNum}`, F(r)];
    slides.push({ id: sid, type: 'title', durationInSeconds: 4, kicker, titleLines: [title], subtitle: EN(r) });
    narration.push({ id: sid, parts: [{ text: NARR(r) || `${kicker}. ${title}.`, voice: 'native' }] });
    if (IMG(r)) scenes.push({ id: sid, scene: IMG(r) });
  } else if (seg === 'WORD') {
    const sid = id('vocab');
    slides.push({
      id: sid, type: 'vocab', durationInSeconds: 6,
      word: F(r), translation: EN(r), phonetic: PRON(r), pos: posOf.get(F(r)) || 'mot',
    });
    narration.push({ id: sid, parts: [{ text: NARR(r) || `${F(r)}.`, voice: 'native' }, ...enPart(r)] });
    if (IMG(r)) scenes.push({ id: sid, scene: IMG(r) });
    words.push({ word: F(r), translation: EN(r) });
  } else if (seg === 'BUILD') {
    // group consecutive BUILD rows into one build-up slide
    const group = [r];
    while (i + 1 < rows.length && String(rows[i + 1]['Segment']).trim() === 'BUILD') group.push(rows[++i]);
    const sid = id('buildup');
    slides.push({
      id: sid, type: 'buildup', durationInSeconds: 3 * group.length,
      eyebrow: 'On construit la phrase',
      steps: group.map((g) => ({ base: F(g) })),
      translation: EN(group[group.length - 1]),
    });
    narration.push({ id: sid, parts: [{ text: group.map(NARR).filter(Boolean).join(' ') || group.map(F).join(' '), voice: 'native' }] });
  } else if (seg === 'SUBJECT') {
    const sid = id('subject');
    slides.push({
      id: sid, type: 'buildup', durationInSeconds: 4,
      eyebrow: 'On change', steps: [{ base: F(r) }], translation: EN(r),
    });
    narration.push({ id: sid, parts: [{ text: NARR(r) || F(r), voice: 'native' }, ...enPart(r)] });
  } else if (seg === 'YOUR TURN') {
    const sid = id('yourturn');
    const secs = Number((NARR(r).match(/(\d+)\s*secondes?/) || [])[1] || 10);
    const prompt = F(r).replace(/^À toi\s*!?\s*/i, '').trim() || F(r);
    slides.push({
      id: sid, type: 'yourturn', durationInSeconds: secs,
      cue: 'À toi !', prompt, sub: NARR(r).replace(/\.?\s*\d+\s*secondes?\.?/i, '').trim(), seconds: secs,
    });
    narration.push({ id: sid, minSeconds: secs, parts: [{ text: NARR(r) || prompt, voice: 'native' }] });
  } else if (seg === 'MODEL') {
    const sid = id('model');
    slides.push({
      id: sid, type: 'model', durationInSeconds: 5,
      eyebrow: 'Exemple de réponse', highlight: F(r), rest: '',
      compareNote: 'Compare avec ta phrase.', translationEn: EN(r),
    });
    narration.push({ id: sid, parts: [{ text: NARR(r) || F(r), voice: 'native' }, ...enPart(r)] });
  } else if (seg === 'RECAP') {
    const sid = 'recap';
    slides.push({ id: sid, type: 'recap', durationInSeconds: 6, eyebrow: 'Récapitulatif', items: words.slice() });
    narration.push({ id: sid, parts: [{ text: NARR(r) || 'Récapitulatif.', voice: 'native' }] });
  } else if (seg === 'SUMMARY') {
    const sid = 'score';
    const parts = F(r).split('·').map((s) => s.trim());
    const wordsToday = (F(r).match(/\+\s*\d+/) || ['+' + (map?.['New words'] ?? '')])[0].replace(/\s/g, '');
    const cum = map?.['Cumulative'] ?? 0;
    slides.push({
      id: sid, type: 'score', durationInSeconds: 6,
      headline: (NARR(r).split(/[.!]/)[0] || 'Bravo').trim() + ' !',
      nowSayLead: 'Tu peux maintenant dire :',
      nowSaySentence: parts.find((p) => /tu peux|dire/i.test(p)) || parts[parts.length - 1] || '',
      stats: {
        wordsToday, wordsTodayLabel: 'mots aujourd’hui',
        levelValue: `A1 · ${cum}/235`, levelLabel: 'niveau', levelPct: Math.round((Number(cum) / 235) * 100),
        sentences: '1', sentencesLabel: 'phrases écrites',
      },
    });
    narration.push({ id: sid, parts: [{ text: NARR(r) || 'Bravo !', voice: 'native' }] });
  }
}

// ---- lesson shell --------------------------------------------------------
const newWords = Number(map?.['New words'] ?? words.length);
const cumulative = Number(map?.['Cumulative'] ?? newWords);
const lesson = {
  title: `Leçon ${lessonNum} — ${map?.['Titre (FR)'] ?? ''}`,
  language: LANG,
  ui: { repeat: 'Répète' },
  chrome: {
    lessonA: `Leçon ${lessonNum}`, lessonB: String(map?.['Titre (FR)'] ?? ''), level: 'A1',
    progressLabel: 'Progression', wordUnit: 'mots',
    wordsFrom: cumulative - newWords, wordsTo: cumulative, wordsTotal: 235,
  },
  slides,
  overlays: [],
};

// ---- media (audio durations + images), unless --no-media -----------------
if (!noMedia) {
  const byId = Object.fromEntries(slides.map((s) => [s.id, s]));

  if (hasElevenKey()) {
    const nat = nativeVoice(LANG);
    const tmpDir = path.join(ROOT, 'public/assets/audio', LID, LANG, '_parts');
    console.log(`\n▶ narration (${LID}.${LANG}, voice ${nat})`);
    for (const seg of narration) {
      const s = byId[seg.id];
      if (!seg.parts?.length) { s.durationInSeconds = seg.minSeconds ?? 3; continue; }
      const rel = `assets/audio/${LID}/${LANG}/${seg.id}.mp3`;
      const spoken = await synthSegment({ parts: seg.parts, nat, remotionBin: REMOTION, outAbs: path.join(ROOT, 'public', rel), tmpDir, id: seg.id });
      s.durationInSeconds = +Math.max(spoken + TAIL_PAD, seg.minSeconds || 0).toFixed(2);
      s.audioSrc = rel;
      console.log(`  · ${seg.id}: ${spoken.toFixed(2)}s → ${s.durationInSeconds}s`);
    }
    await cleanup(tmpDir);
  } else {
    console.warn('• No ELEVENLABS_API_KEY — keeping placeholder durations, no audio.');
  }

  console.log(`\n▶ images (${scenes.length}, ${styleId ? 'custom style' : 'base style'}${forceImages ? '' : ', locked: skip existing'})`);
  for (const sc of scenes) {
    const s = byId[sc.id];
    const rel = `assets/images/${LID}_${sc.id}.png`;
    const abs = path.join(ROOT, 'public', rel);
    // Locked by default: keep the approved image if it already exists.
    if (existsSync(abs) && !forceImages) {
      s.imageSrc = rel;
      if (s.type === 'vocab') s.imageSrcs = [rel];
      console.log(`  · ${sc.id}: kept (locked)`);
      continue;
    }
    try {
      const [url] = await generateImage({ prompt: sc.scene, styleId, style: styleId ? undefined : 'digital_illustration', size: '1024x1024', n: 1 });
      await writeFile(abs, Buffer.from(await (await fetch(url)).arrayBuffer()));
      s.imageSrc = rel;
      if (s.type === 'vocab') s.imageSrcs = [rel];
      console.log(`  · ${sc.id}: ${rel}`);
    } catch (e) {
      console.error(`  · ${sc.id}: image failed — ${e.message}`);
    }
  }
}

// ---- write baked lesson --------------------------------------------------
const outDir = path.join(ROOT, 'src/data/lessons');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${LID}.${LANG}.json`);
await writeFile(outPath, JSON.stringify(lesson, null, 2) + '\n');
console.log(`\n✓ ${slides.length} slides → ${path.relative(ROOT, outPath)}`);
console.log(`  Duration ≈ ${lesson.slides.reduce((a, s) => a + s.durationInSeconds, 0).toFixed(1)}s\n`);
