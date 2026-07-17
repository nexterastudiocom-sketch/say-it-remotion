// Deterministic transcript generator — builds a full SOP-structured "sent" draft
// from the words + sentences, no API key needed. Used when ANTHROPIC_API_KEY is
// unset (with a key, the server uses Claude for nicer prose instead).
//
// Input words:     "french | english | pronunciation | optional tip" per line
// Input sentences: "french | english" per line
// Voices: teaching = FR·WOMAN + EN·MAN ; recall/summary = FR·WOMAN + EN·WOMAN.
// Rules honored: French voice says only taught vocab; no bare "clear" tag.

export function buildTranscript({ lessonNum = '1', titleFr = '', titleEn = '', words = '', sentences = '' }) {
  const W = words.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0]);
  const S = sentences.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0]);
  const out = [];
  const seg = (t) => out.push(`\n## ${t}`);
  const pause = (s, ph) => out.push(`    ⏸ PAUSE ${s}s${ph ? `  [${ph}]` : ''}`);
  const line = (voice, text, ph, p) => {
    out.push(`  ${voice.padEnd(8)}${ph ? ` [${ph}]` : ''}  →  ${text}`);
    if (p != null) pause(p, ph);
  };
  const FR = (t, ph, p) => line('FR·WOMAN', t, ph, p);
  const ENM = (t, ph, p) => line('EN·MAN', t, ph, p);
  const ENW = (t, ph, p) => line('EN·WOMAN', t, ph, p);

  out.push(`# Lesson ${lessonNum} — ${titleFr}${titleEn ? ` (${titleEn})` : ''}`);
  out.push(`Model: eleven_v3. Auto-generated draft — review and edit freely.`);

  seg('Opening — welcome & method');
  ENM(`[warmly, welcoming] Welcome to Say It French — the course where you don't just hear French, you speak it. Starting right now.`, null, 1.5);
  ENM(`[warm] Every lesson follows four steps: Meet a word, Echo it back out loud, Build it into a sentence, Make It Yours by writing your own. Let's start.`, null, 1);

  let n = 1;
  seg(`Segment ${n++} · GOAL`);
  ENM(`[bright] Today's goal: ${titleEn || 'greet someone in French'}. Let's meet your first word.`);

  const done = [];
  const ECHO_PROMPTS = ['Repeat.', 'One more time.', 'Last time — nice and steady.'];
  W.forEach((w, i) => {
    const [word, en, , tip] = w; // pronunciation (index 2) not spoken; kept for the card
    const long = /\s/.test(word) || word.length > 6; // phrases + long words get a 3rd echo
    seg(`Segment ${n++} · WORD — ${word}`);
    FR(`${word}.`, 'MEET', 1);
    ENM(`[warm] ${en || word}.`, 'MEET', 2);
    FR(`[slowly] ${word}.`, 'MEET', long ? 3 : 2);
    if (tip) ENM(`[gently instructive] ${tip}`, 'MEET', 1.5);
    FR(`${word}.`, 'MEET', 1);
    const echoes = long ? 3 : 2;
    for (let e = 0; e < echoes; e++) {
      ENM(ECHO_PROMPTS[e] || 'Once more.', 'ECHO', e === 0 ? (long ? 5 : 4.5) : 3);
      FR(`${word}.`, 'ECHO', 2.5);
    }
    done.push([word, en]);
    // pair review after every 2 new words (except right before the big recall)
    if ((i + 1) % 2 === 0 && i !== W.length - 1) {
      seg(`Segment ${n++} · RECALL`);
      ENW(`[inviting] Quick check — say the English before I move on.`, 'RECALL', 1.5);
      for (const [cw] of done.slice(-2)) FR(`${cw}.`, 'RECALL', 2.5);
    }
  });

  // big two-way review of everything before building sentences
  if (done.length > 2) {
    seg(`Segment ${n++} · RECALL — everything so far`);
    ENW(`[inviting] Big check-in. I'll say each word — say the English out loud before I move on.`, 'RECALL', 1.5);
    for (const [cw] of done) FR(`${cw}.`, 'RECALL', 2.5);
    ENW(`[warm] Now the other way — I'll say the English, you say the French.`, 'RECALL', 1.5);
    for (const [cw, ce] of done) { ENW(`${ce || cw}.`, 'RECALL', 2.5); FR(`${cw}.`, 'RECALL', 1.5); }
  }

  S.forEach((s, i) => {
    const [sf, se] = s;
    seg(`Segment ${n++} · BUILD — ${sf}`);
    ENM(`[inviting] ${i === 0 ? 'Now we build a sentence, one piece at a time.' : 'Next piece.'}${se ? ` — ${se}` : ''}`, 'BUILD', 1.5);
    FR(sf, 'BUILD', 2);
  });
  if (S.length) {
    ENM(`Repeat the whole sentence.`, 'BUILD', 6);
    FR(S[S.length - 1][0], 'BUILD', 2.5);
  }

  seg(`Segment ${n++} · SUMMARY`);
  ENW(`[excited, warm, celebratory] That's ${W.length} new word${W.length === 1 ? '' : 's'}. Great work today.`, 'RECAP');
  FR(`Bravo !`, 'RECAP');
  ENW(`[warm] Lesson done. See you next time.`, 'RECAP', 1);
  FR(`À bientôt !`, 'RECAP');

  return out.join('\n') + '\n';
}
