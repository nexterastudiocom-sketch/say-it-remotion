const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const logEl = $('#log');
const log = (s) => { logEl.textContent += s + '\n'; logEl.scrollTop = logEl.scrollHeight; };
const showLog = (on) => $('#logWrap').classList.toggle('hidden', !on);
const toast = (m, err) => { const t = el('div', 'toast' + (err ? ' err' : ''), m); document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400); };
const api = (p, body, method) => fetch(p, body || method ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined } : {}).then((r) => r.json());
const page = $('#page');

let CONFIG = null, PROJECTS = [], CURRENT = localStorage.getItem('sayit.project') || '';
const langColor = (code) => CONFIG?.languages?.[code]?.accent || '#2E4FE0';
const currentProject = () => PROJECTS.find((p) => p.id === CURRENT) || null;

async function boot() { CONFIG = await api('/api/config'); PROJECTS = await api('/api/projects'); route(); }
window.addEventListener('hashchange', route);
function route() {
  if (fullPlayer) fullPlayer.stop(); // stop full-audio playback on navigation
  const r = (location.hash.replace('#/', '') || 'projects').split('?')[0];
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === r));
  showLog(r === 'editor');
  ({ projects: Projects, config: Config, generate: Generate, editor: Editor, cover: Cover }[r] || Projects)();
}
$('#logClear').onclick = () => (logEl.textContent = '');
function setCtx() { const p = currentProject(); $('#ctx').textContent = p ? `${p.name} · ${CONFIG.languages[p.language]?.name} · ${p.level}` : 'no project selected'; }

// ============================ PROJECTS ============================
async function Projects() {
  PROJECTS = await api('/api/projects'); setCtx();
  page.innerHTML = ''; const wrap = el('div', 'pg');
  const head = el('div', 'pg-head'); head.append(el('h2', null, 'Projects'));
  const nb = el('button', 'btn primary', '+ New project'); nb.onclick = newProjectForm; head.append(nb);
  wrap.append(head);

  const grid = el('div', 'proj-grid');
  if (!PROJECTS.length) grid.append(el('p', 'muted', 'No projects yet. Create one to pick a language + level and start.'));
  for (const p of PROJECTS) {
    const card = el('div', 'proj-card');
    const cover = el('div', 'proj-cover');
    if (p.cover?.src) { const im = el('img'); im.src = '/' + p.cover.src + '?t=' + Date.now(); cover.append(im); }
    else cover.style.background = langColor(p.language);
    const b = el('div', 'proj-body');
    b.append(el('div', 'proj-name', p.name));
    const meta = el('div', 'proj-meta');
    const chip = el('span', 'lchip', CONFIG.languages[p.language]?.name || p.language); chip.style.background = langColor(p.language);
    meta.append(chip, el('span', 'muted', p.level), el('span', 'muted', new Date(p.updatedAt).toLocaleDateString()));
    b.append(meta);
    const acts = el('div', 'proj-acts');
    const open = el('button', 'btn', 'Open editor'); open.onclick = () => { CURRENT = p.id; localStorage.setItem('sayit.project', p.id); location.hash = '#/editor'; };
    const cov = el('button', 'btn', 'Cover'); cov.onclick = () => { CURRENT = p.id; localStorage.setItem('sayit.project', p.id); location.hash = '#/cover'; };
    acts.append(open, cov);
    if (p.video) { const v = el('a', 'btn', 'Video ▸'); v.href = '/film/' + p.video; v.target = '_blank'; acts.append(v); }
    b.append(acts); card.append(cover, b); grid.append(card);
  }
  wrap.append(grid); page.append(wrap);
}
function newProjectForm() {
  page.innerHTML = ''; const wrap = el('div', 'pg'); wrap.append(el('h2', null, 'New project'));
  const f = el('div', 'form');
  const name = field(f, 'Project name', inputEl('text', 'Lesson 1 — Dire bonjour'));
  const lang = field(f, 'Language', selectEl(Object.entries(CONFIG.languages).map(([c, l]) => [c, l.name])));
  const lvl = field(f, 'Level', selectEl(CONFIG.levels.map((l) => [l, l])));
  const save = el('button', 'btn primary', 'Create project');
  save.onclick = async () => {
    if (!name.value.trim()) return toast('Name required', true);
    const proj = await api('/api/project', { name: name.value.trim(), language: lang.value, level: lvl.value, lessonId: 'lesson-01' });
    CURRENT = proj.id; localStorage.setItem('sayit.project', proj.id); toast('Project created'); location.hash = '#/editor';
  };
  const cancel = el('button', 'btn', 'Cancel'); cancel.onclick = () => (location.hash = '#/projects');
  const row = el('div', 'btn-row'); row.append(save, cancel); f.append(row);
  wrap.append(f); page.append(wrap);
}

// ============================ CONFIG (colors) ============================
const SPARK = [['accent', 'Accent (wedge)'], ['tint', 'Tint (lesson)'], ['spark.ring', 'Ring'], ['spark.chip', 'Chip / underline'], ['spark.dot', 'Dot'], ['spark.badgeBg', 'Badge bg'], ['spark.badgeFg', 'Badge text'], ['spark.badgeDot', 'Badge dot']];
function getPath(o, p) { return p.split('.').reduce((a, k) => a?.[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
async function Config() {
  CONFIG = await api('/api/config'); const ic = await api('/api/image-config'); const sm = await api('/api/sample');
  page.innerHTML = ''; const wrap = el('div', 'pg');
  const head = el('div', 'pg-head'); head.append(el('h2', null, 'Language color packages'));
  const save = el('button', 'btn primary', 'Save colors'); head.append(save); wrap.append(head);
  wrap.append(el('p', 'muted', 'Drives lesson accent/tint and the Warm-Spark cover. Re-render a lesson/cover to apply.'));

  // ---- constant image style (locked; every image uses this) ----
  const isec = el('div', 'cfg-card');
  isec.append(el('div', 'cfg-lang', '').appendChild(el('span', 'lchip', 'Image style')).parentElement);
  isec.querySelector('.lchip').style.background = '#5C5F66';
  const grid = el('div', 'form');
  const roField = (label, val) => { const f = el('div', 'field'); f.append(el('span', 'flabel', label)); const i = el('input'); i.value = val; i.readOnly = true; f.append(i); grid.append(f); };
  roField('Recraft custom style ID (locked)', ic.styleId || '(not set — using base style)');
  roField('Base style', ic.baseStyle);
  const df = el('div', 'field'); df.append(el('span', 'flabel', 'Style descriptor')); const dta = el('textarea'); dta.value = ic.descriptor; dta.readOnly = true; dta.style.height = '70px'; df.append(dta); grid.append(df);
  isec.append(grid);
  isec.append(el('p', 'muted', 'Every image in every lesson is generated with this one style, so the whole channel stays visually consistent.'));

  // ---- transcript sample (pattern the Generate page follows) ----
  const ssec = el('div', 'cfg-card');
  const sh = el('div', 'cfg-lang'); sh.append(el('span', 'lchip', 'Transcript sample')); sh.querySelector('.lchip').style.background = '#5C5F66'; ssec.append(sh);
  ssec.append(el('p', 'muted', 'The reference transcript the Generate page mimics. Edit it to change the structure/style of every generated lesson.'));
  const sta = el('textarea'); sta.className = 'transcript'; sta.style.height = '260px'; sta.value = sm.sample || ''; ssec.append(sta);
  const ssave = el('button', 'btn primary', 'Save sample'); ssave.style.marginTop = '10px';
  ssave.onclick = async () => { await api('/api/sample', { sample: sta.value }); toast('Sample saved'); };
  ssec.append(el('div', 'btn-row', ''), ssave);

  wrap.append(el('div', 'flabel', 'IMAGE GENERATION'), isec, el('div', 'flabel', 'TRANSCRIPT GENERATOR'), ssec, el('div', 'flabel', 'COLORS'));
  for (const [code, l] of Object.entries(CONFIG.languages)) {
    const card = el('div', 'cfg-card');
    const h = el('div', 'cfg-lang'); h.append(el('span', 'lchip', l.name), el('span', 'muted', code));
    h.querySelector('.lchip').style.background = l.accent; card.append(h);
    const row = el('div', 'cfg-swatches');
    for (const [pathk, label] of SPARK) {
      const cell = el('label', 'swatch');
      const inp = inputEl('color', getPath(l, pathk) || '#000000'); inp.dataset.code = code; inp.dataset.path = pathk;
      inp.oninput = () => { setPath(CONFIG.languages[code], pathk, inp.value); if (pathk === 'accent') h.querySelector('.lchip').style.background = inp.value; };
      cell.append(inp, el('span', 'sw-label', label));
      row.append(cell);
    }
    card.append(row); wrap.append(card);
  }
  save.onclick = async () => { await api('/api/config', CONFIG); toast('Colors saved'); };
  page.append(wrap);
}

// ============================ GENERATE ============================
async function Generate() {
  setCtx();
  page.innerHTML = ''; const wrap = el('div', 'pg');
  wrap.append(el('h2', null, 'Generate a lesson transcript'));
  wrap.append(el('p', 'muted', 'Give the words and sentences; it drafts the full transcript in the SOP structure. Works with no API key (template-based); add an ANTHROPIC_API_KEY to .env for richer Claude-written prose. Then review, tweak, and use it in the Editor.'));
  const f = el('div', 'form');
  const p = currentProject();
  const num = field(f, 'Lesson number', inputEl('text', p?.level ? '1' : '1'));
  const tfr = field(f, 'Title (French)', inputEl('text', 'Dire bonjour'));
  const ten = field(f, 'Title (English)', inputEl('text', 'Saying hello'));
  f.append(el('div', 'flabel', 'Words — one per line:  french | english | pronunciation | optional tip'));
  const words = el('textarea'); words.className = 'gen-ta'; words.placeholder = 'bonjour | hello, good morning | bohn-ZHOOR | the "on" is nasal\nsalut | hi, bye (informal) | sah-LU\nmerci | thank you | mehr-SEE';
  f.append(words);
  f.append(el('div', 'flabel', 'Sentences — one per line:  french | english  (optional)'));
  const sents = el('textarea'); sents.className = 'gen-ta'; sents.placeholder = 'Bonjour, madame. | Hello, ma’am.\nBonjour, madame. Merci ! | Hello, ma’am. Thank you!';
  f.append(sents);
  const btns = el('div', 'btn-row');
  const gen = el('button', 'btn primary', 'Generate transcript ⚙');
  btns.append(gen); f.append(btns);
  wrap.append(f);

  const out = el('div', 'gen-out hidden');
  out.append(el('div', 'flabel', 'Draft transcript (editable)'));
  const ta = el('textarea'); ta.className = 'transcript gen-result';
  const orow = el('div', 'btn-row');
  const use = el('button', 'btn accent', 'Use in Editor ▸');
  const copy = el('button', 'btn', 'Copy');
  orow.append(use, copy);
  out.append(ta, orow); wrap.append(out); page.append(wrap);

  gen.onclick = async () => {
    if (!words.value.trim()) return toast('Add some words first', true);
    gen.disabled = true; gen.textContent = 'Generating…';
    const r = await api('/api/generate-transcript', { lessonNum: num.value.trim() || '1', titleFr: tfr.value.trim(), titleEn: ten.value.trim(), words: words.value, sentences: sents.value });
    gen.disabled = false; gen.textContent = 'Generate transcript ⚙';
    if (r.error) return toast(r.error, true);
    ta.value = r.transcript; out.classList.remove('hidden'); ta.scrollIntoView({ behavior: 'smooth' });
    if (r.truncated) toast('Output was long and may be truncated — review the end', true);
    else toast('Draft ready — review it');
  };
  copy.onclick = () => { navigator.clipboard.writeText(ta.value); toast('Copied'); };
  use.onclick = async () => { await api('/api/transcript', { text: ta.value }); toast('Saved — opening editor'); location.hash = '#/editor'; };
}

// ============================ COVER ============================
async function Cover() {
  const p = currentProject(); setCtx();
  const imgs = await api('/api/images');
  page.innerHTML = ''; const wrap = el('div', 'pg cover-pg');
  wrap.append(el('h2', null, 'Cover / thumbnail' + (p ? ` — ${p.name}` : '')));
  const c = p?.cover || {};
  const state = { language: p?.language || 'fr', level: p?.level || 'A1', line1: c.line1 || 'Je', line2: c.line2 || 'travaille', subtitle: c.subtitle || 'Talk about your job', imageSrc: c.imageSrc || imgs[0] || '' };

  const grid = el('div', 'cover-layout');
  const form = el('div', 'form');
  const lang = field(form, 'Language', selectEl(Object.entries(CONFIG.languages).map(([cc, l]) => [cc, l.name]), state.language));
  const lvl = field(form, 'Level', selectEl(CONFIG.levels.map((l) => [l, l]), state.level));
  const l1 = field(form, 'Title line 1', inputEl('text', state.line1));
  const l2 = field(form, 'Title line 2', inputEl('text', state.line2));
  const sub = field(form, 'Subtitle', inputEl('text', state.subtitle));
  form.append(el('div', 'flabel', 'Pick an image'));
  const picker = el('div', 'img-picker');
  const drawPicker = () => { picker.innerHTML = ''; for (const src of imgs) { const im = el('img'); im.src = '/' + src; im.className = src === state.imageSrc ? 'sel' : ''; im.onclick = () => { state.imageSrc = src; drawPicker(); }; picker.append(im); } };
  drawPicker(); form.append(picker);

  const preview = el('div', 'cover-preview');
  const pv = el('img', 'cover-img'); preview.append(pv);
  const hint = el('p', 'muted', 'Render to preview the cover.'); preview.append(hint);
  const btns = el('div', 'btn-row');
  const render = el('button', 'btn primary', 'Render cover ▸');
  const collect = () => { state.language = lang.value; state.level = lvl.value; state.line1 = l1.value; state.line2 = l2.value; state.subtitle = sub.value; };
  render.onclick = async () => {
    collect(); render.disabled = true; render.textContent = 'Rendering…';
    const id = p ? p.id : 'adhoc';
    const r = await api('/api/cover', { id, ...state });
    render.disabled = false; render.textContent = 'Render cover ▸';
    if (r.error) { toast('Render failed', true); log(r.error); return showLog(true); }
    pv.src = '/' + r.src + '?t=' + Date.now(); hint.textContent = 'Rendered ✓  (1280×720)';
    if (p) { p.cover = { ...state, src: r.src }; await api('/api/project', p); toast('Cover saved to project'); PROJECTS = await api('/api/projects'); }
    else toast('Cover rendered');
  };
  const dl = el('a', 'btn', 'Download'); dl.onclick = () => { if (pv.src) { dl.href = pv.src; dl.download = 'cover.png'; } };
  btns.append(render, dl); form.append(btns);
  grid.append(form, preview); wrap.append(grid); page.append(wrap);
}

// ============================ EDITOR ============================
let S = null;
let playlist = []; // flat, in-order list of beats (clips + pauses) for full-audio preview
let fullPlayer = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function Editor() {
  setCtx(); S = await api('/api/state');
  page.innerHTML = ''; const wrap = el('div', 'pg editor-pg');
  const head = el('div', 'pg-head');
  head.append(el('h2', null, `Editor — ${S.lesson.title || S.lessonId}`));
  const full = el('button', 'btn', '▶ Full audio');
  const save = el('button', 'btn', 'Save transcript'); const build = el('button', 'btn primary', 'Build audio ▸'); const render = el('button', 'btn accent', 'Render video ▸');
  head.append(full, save, build, render); wrap.append(head);
  full.onclick = () => playFull(full);

  const cols = el('div', 'ed-grid');
  const left = el('div', 'ed-col');
  left.append(el('div', 'col-head', 'Transcript'));
  const ta = el('textarea', 'transcript'); ta.spellcheck = false; ta.value = S.transcript; left.append(ta);

  const right = el('div', 'ed-col');
  const tabs = el('nav', 'tabs');
  const tl = el('div', 'panel'); const im = el('div', 'panel hidden'); const vid = el('div', 'panel hidden');
  const mkTab = (name, label, pane) => { const b = el('button', 'tab', label); b.onclick = () => { tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('on')); b.classList.add('on'); [tl, im, vid].forEach((x) => x.classList.add('hidden')); pane.classList.remove('hidden'); }; return b; };
  const tA = mkTab('t', 'Slides & voices', tl); tA.classList.add('on'); tabs.append(tA, mkTab('i', 'Images', im), mkTab('v', 'Video', vid));
  right.append(tabs, tl, im, vid);
  renderTimeline(tl); renderImages(im);
  const player = el('video'); player.controls = true; player.className = 'player'; vid.append(player);
  cols.append(left, right); wrap.append(cols); page.append(wrap);

  save.onclick = async () => { await api('/api/transcript', { text: ta.value }); toast('Saved'); };
  build.onclick = async () => { await api('/api/transcript', { text: ta.value }); build.disabled = true; stream('/api/build', async () => { build.disabled = false; await Editor(); toast('Build complete'); }); };
  render.onclick = () => { render.disabled = true; tabs.querySelectorAll('.tab')[2].click(); stream('/api/render', async (code) => { render.disabled = false; if (code === 0) { player.src = '/film/' + S.lessonId + '-studio.mp4?t=' + Date.now(); const p = currentProject(); if (p) { p.video = S.lessonId + '-studio.mp4'; await api('/api/project', p); } toast('Render complete'); } else toast('Render failed', true); }); };
}
function renderTimeline(box) {
  box.innerHTML = ''; playlist = [];
  for (const slide of S.lesson.slides || []) {
    const card = el('div', 'slide'); const h = el('div', 'slide-head');
    h.append(el('span', 'id', slide.id), el('span', 'type', slide.type));
    if (slide.word) h.append(el('span', '', `“${slide.word}”`));
    h.append(el('span', 'dur', `${(slide.durationInSeconds || 0).toFixed(1)}s`)); card.append(h);
    const beats = el('div', 'beats');
    for (const b of slide.beats || []) {
      const row = el('div', 'beat');
      if (!b.src) { row.append(el('span', 'vchip pause', 'pause'), el('span', 'txt pausebeat', `silence · ${b.durationInSeconds}s${b.phase ? ' · ' + b.phase : ''}`)); beats.append(row); playlist.push({ isPause: true, dur: b.durationInSeconds, row }); continue; }
      playlist.push({ isPause: false, src: b.src, dur: b.durationInSeconds, row });
      const isFr = (b.voice || '').startsWith('fr');
      row.append(el('span', 'vchip ' + (isFr ? 'fr' : 'en'), b.voice.replace('_', '·')));
      const txt = el('div', 'txt'); if (b.phase) txt.append(el('div', 'ph', b.phase));
      const ed = el('div', 'ctext'); ed.contentEditable = 'true'; ed.spellcheck = false; ed.textContent = b.text || ''; txt.append(ed); row.append(txt);
      const acts = el('div', 'acts');
      const play = el('button', 'iconbtn', '▶'); play.onclick = () => { const a = $('#audio'); a.src = '/' + b.src + '?t=' + Date.now(); a.play(); };
      const regen = el('button', 'iconbtn', '↻'); regen.title = 'Regenerate from the text (ElevenLabs)';
      regen.onclick = async () => { const nt = ed.textContent.trim(); if (!nt) return toast('Empty', true); regen.classList.add('busy'); regen.textContent = '…';
        const r = await api('/api/clip', { src: b.src, text: nt, voice: b.voice }); regen.classList.remove('busy'); regen.textContent = '↻';
        if (r.error) return toast(r.error, true); b.text = nt; if (r.transcript != null) { S.transcript = r.transcript; const t = $('.transcript'); if (t) t.value = r.transcript; }
        toast('Regenerated + saved'); const a = $('#audio'); a.src = '/' + b.src + '?t=' + Date.now(); a.play(); };
      acts.append(play, regen); row.append(acts); beats.append(row);
    }
    card.append(beats); box.append(card);
  }
}
// Play the whole lesson's audio back-to-back with the real silent pauses, so you
// can verify pacing before a full render. Uses the baked timeline (same as render).
async function playFull(btn) {
  if (fullPlayer) { fullPlayer.stop(); return; }
  if (!playlist.length) return toast('Nothing to play — build the audio first', true);
  const a = $('#audio');
  let stopped = false, pending = null;
  const clearHi = () => document.querySelectorAll('.beat.playing').forEach((r) => r.classList.remove('playing'));
  const reset = () => { btn.textContent = '▶ Full audio'; btn.classList.remove('accent'); clearHi(); fullPlayer = null; };
  fullPlayer = { stop() { stopped = true; a.pause(); if (pending) { const r = pending; pending = null; r(); } reset(); } };
  btn.textContent = '⏹ Stop'; btn.classList.add('accent');

  for (let i = 0; i < playlist.length && !stopped; i++) {
    const p = playlist[i];
    clearHi();
    if (p.row) { p.row.classList.add('playing'); p.row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    if (p.isPause) {
      await new Promise((r) => { pending = r; setTimeout(() => { if (pending) { pending = null; r(); } }, Math.round(p.dur * 1000)); });
    } else {
      await new Promise((r) => {
        pending = r;
        a.src = '/' + p.src + '?t=' + Date.now();
        a.onended = () => { if (pending) { pending = null; r(); } };
        a.onerror = () => { if (pending) { pending = null; r(); } };
        a.play().catch(() => { if (pending) { pending = null; r(); } });
      });
    }
  }
  if (!stopped) reset();
}

function renderImages(box) {
  box.innerHTML = '';
  box.append(el('p', 'muted', 'One image per segment. Edit the description and regenerate — all images use the locked style (see Languages → Image style).'));
  // one card per unique generated image (title/cover + each vocab word), in lesson order
  const seen = new Set(); const items = [];
  for (const s of S.lesson.slides || []) {
    const src = s.imageSrc || (s.imageSrcs && s.imageSrcs[0]);
    if (!src) continue;
    const m = src.match(/_([^_/]+)\.png$/); // lesson-XX_<segId>.png
    const segId = m ? m[1] : s.id;
    if (seen.has(segId)) continue; seen.add(segId);
    items.push({ segId, src, label: s.word || (s.type === 'title' ? 'Title / cover image' : s.id) });
  }
  if (!items.length) return box.append(el('p', 'muted', 'No image segments in this lesson.'));
  for (const it of items) {
    const card = el('div', 'imgcard');
    const img = el('img'); img.src = '/' + it.src + '?t=' + Date.now();
    const right = el('div');
    right.append(el('div', 'seg', `${it.label}  ·  ${it.segId}`));
    const ta = el('textarea'); ta.placeholder = 'Describe this image…'; ta.value = S.scenes?.[it.segId] || '';
    const btn = el('button', 'btn primary', 'Regenerate image ↻');
    btn.onclick = async () => {
      if (!ta.value.trim()) return toast('Add a description first', true);
      btn.disabled = true; btn.textContent = 'Generating…';
      const r = await api('/api/image', { segment: it.segId, scene: ta.value.trim() });
      btn.disabled = false; btn.textContent = 'Regenerate image ↻';
      if (r.error) return toast(r.error, true);
      img.src = '/' + r.src + '?t=' + Date.now();
      S.scenes = S.scenes || {}; S.scenes[it.segId] = ta.value.trim();
      toast('Image regenerated');
    };
    right.append(ta, btn); card.append(img, right); box.append(card);
  }
}
function stream(url, onDone) {
  showLog(true); log(`\n$ ${url}`);
  const es = new EventSource(url);
  const cancelBtn = $('#logCancel');
  let cancelled = false;
  const done = (code) => { es.close(); cancelBtn.classList.add('hidden'); cancelBtn.onclick = null; };
  cancelBtn.classList.remove('hidden');
  cancelBtn.onclick = async () => { cancelled = true; try { await api('/api/cancel', {}); } catch {} es.close(); log('— cancelled —'); cancelBtn.classList.add('hidden'); onDone && onDone(-1); };
  es.onmessage = (e) => { const d = JSON.parse(e.data); if (d.line) log(d.line); if (d.done) { done(); log(`— done (exit ${d.code}) —`); if (!cancelled) onDone && onDone(d.code); } };
  es.onerror = () => done();
}

// ---- little form helpers ----
function inputEl(type, val) { const i = el('input'); i.type = type; if (type === 'color') i.value = val; else i.placeholder = val, i.value = val; return i; }
function selectEl(pairs, sel) { const s = el('select'); for (const [v, label] of pairs) { const o = el('option', null, label); o.value = v; if (v === sel) o.selected = true; s.append(o); } return s; }
function field(parent, label, input) { const w = el('label', 'field'); w.append(el('span', 'flabel', label), input); parent.append(w); return input; }

boot();
