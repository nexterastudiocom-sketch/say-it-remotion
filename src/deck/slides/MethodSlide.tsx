import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Img } from 'remotion';
import { assetSrc } from '../../assetSrc';
import { fadeUp } from '../anim';

// One generic, frame-aware slide that renders any of the 12 Method stages from
// the baked beat data.
//
// TWO VISUAL REGISTERS — the load-bearing idea. The learner must always be able
// to tell, by style and screen zone alone, whether something is a spoken
// INSTRUCTION (what to do) or a WORD (the language to learn), regardless of the
// language the instruction happens to be in.
//   • INSTRUCTION register — static. One fixed style (plain Inter, grey), one
//     fixed zone (the band under the eyebrow). Never scales, never recolours.
//   • WORD register — prominent. Big, bold, accent-coloured, in the centre hero
//     zone. This covers BOTH the French word and its English meaning; a target
//     word quoted inside an instruction is lifted into word styling inline.
//
// Two load-bearing pedagogy rules still hold:
//  X-06 / I-05 — no French TEXT during an L3+ retrieval PAUSE (the silent gap
//         where the learner recalls unaided). The word stays hidden while the
//         countdown runs; it appears the instant the correct answer is SPOKEN
//         (the reveal) so the learner always sees the word they just heard.
//  I-12 — the ILLUSTRATION stays at every level; a retrieval beat is a picture +
//         mic, never a blank screen.

const STAGE_LABEL: Record<string, string> = {
  CAN_DO_GOAL: 'Your goal', WARM_UP: 'Warm up', COLD_INPUT: 'Listen',
  ITEM_BLOCK: 'New word', MICRO_RECALL: 'Quick check', FRAME_INTRO: 'Build a sentence',
  BUILD_LADDER: 'Build it', INPUT_RETURN: 'Listen again', MAKE_IT_YOURS: 'Make it yours',
  TRANSFER_TASK: 'Your turn', FLUENCY_ROUND: 'Fluency', CAN_DO_CHECK: 'You can now',
};

type Register = 'word' | 'meaning' | 'instruction';
type Beat = { voice?: string; text?: string; register?: Register; level?: number; durationInSeconds: number; stage?: string; visuals?: string[]; imageSrc?: string; wantsImage?: boolean };
type SlideT = { stage?: string; visual?: string; imageSrc?: string; item?: string; beats?: Beat[]; wantsImage?: boolean };

// Beats carry an explicit `register` from the generator (Method §4.2). This
// heuristic is only the fallback for older JSON without it: French is a word; a
// short English gloss with no procedural marker is a meaning, anything procedural
// is an instruction.
const INSTR_RE = /\b(listen|repeat|say|turn|now you|again|do ?n['’]?t|point|answer|ask|out loud|in french|in english|ready|one more|this time|your|nasal|nose|throat|tongue|silent|sound|air|stress|syllable|hear|heard)\b/i;
const roleOf = (b: Beat): Register | null => {
  if (b.register) return b.register;
  if (!b.voice) return null;
  if (b.voice.startsWith('fr')) return 'word';
  const s = (b.text || '').trim();
  if (!s) return 'instruction';
  if (INSTR_RE.test(s)) return 'instruction';
  return s.split(/\s+/).length <= 6 ? 'meaning' : 'instruction';
};

// Lift any quoted target word inside an instruction into word styling, so the
// WORD is always the accent-coloured thing on screen — even mid-sentence.
const renderInstruction = (text: string): React.ReactNode =>
  String(text)
    .split(/([“"„][^”"“]+[”"])/)
    .map((p, i) =>
      /^[“"„]/.test(p)
        ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.replace(/[“”"„]/g, '')}</span>
        : <React.Fragment key={i}>{p}</React.Fragment>
    );

export const MethodSlide: React.FC<{ slide: SlideT }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sf = (s: number) => Math.round(s * fps);
  const beats = slide.beats || [];

  const starts: number[] = [];
  { let c = 0; for (const b of beats) { starts.push(c); c += sf(b.durationInSeconds); } }
  let ai = beats.length - 1;
  for (let i = 0; i < beats.length; i++) if (frame >= starts[i] && frame < starts[i] + sf(beats[i].durationInSeconds)) { ai = i; break; }
  const active = beats[ai] || ({} as Beat);
  const inPause = !active.voice;

  // The last voiced beat drives the hero: French → word reveal, English → its role.
  let si = -1;
  for (let i = ai; i >= 0; i--) if (beats[i].voice) { si = i; break; }
  const spoken = beats[si] || ({} as Beat);
  const isFr = (spoken.voice || '').startsWith('fr');
  const isEnMeaning = (spoken.voice || '').startsWith('en') && roleOf(spoken) === 'meaning';
  const level = spoken.level ?? -1;
  const reveal = fadeUp(Math.max(0, frame - (starts[si] ?? 0)), fps);

  // The instruction band persists the most recent INSTRUCTION beat, so "what to
  // do" stays put in its zone even while a word or meaning is spoken.
  let instruction = '';
  for (let i = ai; i >= 0; i--) {
    const b = beats[i];
    if (b.voice && (b.voice || '').startsWith('en') && roleOf(b) === 'instruction') { instruction = b.text || ''; break; }
  }
  // ONE CONSISTENT STRUCTURE (the learner's eye must settle into a routine):
  //   • instruction band = a pure instruction, NEVER the target word
  //   • hero            = the word, big — English while asking, French once spoken
  // Pull the target word OUT of the cue: the quoted "…", else the token after a
  // dash ("Now you — hello"). The band then reads a fixed instruction per cue verb.
  const q = /[“"„]([^”"“]+)[”"]/.exec(instruction);
  const dash = /[—–-]\s*([^—–.:!?]+?)[.:!?]*\s*$/.exec(instruction.trim());
  const cueWord = (q ? q[1] : (/^(?:now you|your turn|say|repeat)/i.test(instruction.trim()) && dash ? dash[1] : '')).trim();
  const bandText = cueWord
    ? (/repeat/i.test(instruction) ? 'Repeat it in French:'
      : /now you/i.test(instruction) ? 'Now you — say it in French:'
        : 'Your turn — say it in French:')
    : instruction;
  // Hero font scales down for longer text (a single word is huge; a built line like
  // "hello, ma'am. thank you" must still fit on one comfortable block).
  const heroSize = (t: string): number => { const n = (t || '').length; return n > 30 ? 88 : n > 20 ? 116 : n > 12 ? 156 : 200; };

  // The active picture: a per-beat image (recall/scenario) wins, else the slide's.
  const imgRel = spoken.imageSrc || active.imageSrc || slide.imageSrc;
  const wantsImg = spoken.wantsImage || active.wantsImage || slide.wantsImage;
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2.2);

  const label = STAGE_LABEL[slide.stage || ''] || slide.stage || '';
  const vis = slide.visual || '';
  // Teaching word card (below L3): the taught word + phonetic, held on screen.
  const wc = level < 3 ? vis.match(/WORD CARD — ([^·]+?)·\s*\[([^\]]+)\]/) : null;

  // Retrieval countdown: a ≥2s pause after something was said = "your turn".
  const pauseDur = inPause ? active.durationInSeconds : 0;
  const isResponse = inPause && pauseDur >= 2 && si >= 0;
  const remaining = isResponse ? Math.max(1, Math.ceil(pauseDur - (frame - (starts[ai] ?? 0)) / fps)) : 0;

  // WORD reveal: show the spoken French whenever French is the current/last voice
  // — including the L3 answer. During the retrieval countdown the last voice is
  // the English prompt, so the answer stays hidden until it is actually spoken.
  const showFrWord = isFr && !wc;

  const InstructionBand = (
    <div style={{ minHeight: 168, display: 'flex', alignItems: 'center', ...fadeUp(frame, fps) }}>
      {instruction ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 32, maxWidth: 1720,
          background: 'var(--surface)', border: '2px solid var(--line)',
          borderRadius: 28, padding: '30px 48px', boxShadow: 'var(--shadow)' }}>
          <span style={{ flex: 'none', width: 66, height: 66, borderRadius: 18, background: 'var(--tint)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '15px 0 15px 24px',
              borderColor: 'transparent transparent transparent var(--accent)', marginLeft: 6 }} />
          </span>
          <span style={{ fontFamily: 'var(--body)', fontWeight: 500, fontSize: 54, lineHeight: 1.24,
            color: 'var(--ink-2)' }}>{cueWord ? bandText : renderInstruction(instruction)}</span>
        </div>
      ) : null}
    </div>
  );

  const textCol = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
      <span className="eyebrow accent-text" style={{ color: 'var(--accent)', ...fadeUp(frame, fps) }}>{label}</span>

      {InstructionBand}

      {/* WORD ZONE — the hero. French word + phonetic + English meaning all live
          here in word styling; instructions never enter this zone. */}
      <div style={{ minHeight: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        {showFrWord ? (
          // French reveal — the instant the model SPEAKS the French, show it big.
          // Takes precedence so the answer always appears when it is voiced.
          <p style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: heroSize(spoken.text || ''), lineHeight: 1.05,
            letterSpacing: '-0.02em', color: 'var(--accent)', maxWidth: 1680, ...reveal }}>{spoken.text}</p>
        ) : wc ? (
          <div style={{ ...fadeUp(frame, fps, 4) }}>
            <p style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: 176, lineHeight: 1,
              letterSpacing: '-0.02em', color: 'var(--accent)' }}>{wc[1].trim()}</p>
            <p style={{ fontFamily: 'var(--body)', fontWeight: 500, fontSize: 54, marginTop: 14,
              letterSpacing: 2, color: 'var(--ink-2)' }}>[{wc[2].trim()}]</p>
          </div>
        ) : cueWord ? (
          // While asking — the English word/line to translate, big in the SAME hero zone.
          <p style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: heroSize(cueWord), lineHeight: 1.05,
            letterSpacing: '-0.03em', color: 'var(--ink)', maxWidth: 1680, ...fadeUp(frame, fps, 4) }}>{cueWord}</p>
        ) : isEnMeaning ? (
          // An English meaning shown as the prompt — same hero treatment as a word.
          <p style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: heroSize(spoken.text || ''), lineHeight: 1.05,
            letterSpacing: '-0.02em', color: 'var(--ink)', maxWidth: 1680, ...reveal }}>{spoken.text}</p>
        ) : isFr && !imgRel && !wantsImg ? (
          <div style={{ display: 'flex', gap: 24, opacity: 0.28 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--accent)' }} />
            ))}
          </div>
        ) : null}

        {isResponse ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 30, marginTop: 8 }}>
            <span style={{ width: 96, height: 96, borderRadius: 26, background: 'var(--accent)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 52,
              transform: `scale(${pulse})`, boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>{remaining}</span>
            <span style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: 72, color: 'var(--accent)' }}>Your turn</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  const imgPanel = imgRel ? (
    <div style={{ width: 1180, height: 1180, flexShrink: 0, borderRadius: 28, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,0.18)', border: '3px solid rgba(0,0,0,0.06)', background: 'var(--tint)', ...fadeUp(frame, fps, 6) }}>
      <Img src={assetSrc(imgRel)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  ) : wantsImg ? (
    <div style={{ width: 1180, height: 1180, flexShrink: 0, borderRadius: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'var(--tint)', border: '4px dashed rgba(0,0,0,0.18)', ...fadeUp(frame, fps, 6) }}>
      <span style={{ width: 200, height: 200, borderRadius: 28, background: 'var(--surface)', border: '3px solid var(--line)',
        backgroundImage: 'linear-gradient(90deg,rgba(22,24,29,.05) 2px,transparent 2px),linear-gradient(0deg,rgba(22,24,29,.05) 2px,transparent 2px)',
        backgroundSize: '50px 50px' }} />
      <span className="h2" style={{ color: 'var(--accent)', fontWeight: 700, letterSpacing: '-0.02em' }}>Image</span>
      <span className="body" style={{ opacity: 0.5 }}>image pending</span>
    </div>
  ) : null;

  return (
    <AbsoluteFill>
      <div className="content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 120 }}>
        {textCol}
        {imgPanel}
      </div>
    </AbsoluteFill>
  );
};
