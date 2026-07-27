import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Img } from 'remotion';
import { assetSrc } from '../../assetSrc';
import { fadeUp } from '../anim';

// One generic, frame-aware slide that renders any of the 12 Method stages from
// the baked beat data.
//
// Two load-bearing visual rules:
//  X-06 — French TEXT appears only below L3. At L3+ (retrieval) the word and the
//         phonetic disappear.
//  I-12 — but the ILLUSTRATION stays. At L3+ a WordCard is image_only: the
//         picture cues the meaning, the learner supplies the French. It is the
//         one visual that survives the L3 blackout, so a retrieval beat is a
//         picture + mic, never a blank screen.

const STAGE_LABEL: Record<string, string> = {
  CAN_DO_GOAL: 'Your goal', WARM_UP: 'Warm up', COLD_INPUT: 'Listen',
  ITEM_BLOCK: 'New word', MICRO_RECALL: 'Quick check', FRAME_INTRO: 'Build a sentence',
  BUILD_LADDER: 'Build it', INPUT_RETURN: 'Listen again', MAKE_IT_YOURS: 'Make it yours',
  TRANSFER_TASK: 'Your turn', FLUENCY_ROUND: 'Fluency', CAN_DO_CHECK: 'You can now',
};

type Beat = { voice?: string; text?: string; level?: number; durationInSeconds: number; stage?: string; visuals?: string[]; imageSrc?: string };
type SlideT = { stage?: string; visual?: string; imageSrc?: string; item?: string; beats?: Beat[] };

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

  let si = -1;
  for (let i = ai; i >= 0; i--) if (beats[i].voice) { si = i; break; }
  const spoken = beats[si] || ({} as Beat);
  const isFr = (spoken.voice || '').startsWith('fr');
  const isEn = (spoken.voice || '').startsWith('en');
  const level = spoken.level ?? -1;
  const reveal = fadeUp(Math.max(0, frame - (starts[si] ?? 0)), fps);

  // The active picture: a per-beat image (recall/scenario) wins, else the slide's.
  const imgRel = spoken.imageSrc || active.imageSrc || slide.imageSrc;
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2.2);

  // X-06 / I-12: French text only below L3; the picture stays at every level.
  const showFr = isFr && level >= 0 && level < 3;
  const label = STAGE_LABEL[slide.stage || ''] || slide.stage || '';
  const vis = slide.visual || '';
  const wc = level < 3 ? vis.match(/WORD CARD — ([^·]+?)·\s*\[([^\]]+)\]/) : null;

  const pauseDur = inPause ? active.durationInSeconds : 0;
  const isResponse = inPause && pauseDur >= 2 && si >= 0;
  const remaining = isResponse ? Math.max(1, Math.ceil(pauseDur - (frame - (starts[ai] ?? 0)) / fps)) : 0;

  const textCol = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 }}>
      <span className="eyebrow accent-text" style={{ color: 'var(--accent)', ...fadeUp(frame, fps) }}>{label}</span>

      {wc ? (
        <div style={{ ...fadeUp(frame, fps, 4) }}>
          <p className="h1" style={{ color: 'var(--accent)', fontWeight: 800 }}>{wc[1].trim()}</p>
          <p className="body" style={{ marginTop: 12, letterSpacing: 2 }}>[{wc[2].trim()}]</p>
        </div>
      ) : null}

      <div style={{ minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 }}>
        {showFr && !wc ? (
          <p className="h1" style={{ color: 'var(--accent)', fontWeight: 800, ...reveal }}>{spoken.text}</p>
        ) : isEn ? (
          <p className="h2" style={{ color: 'var(--ink)', fontWeight: 600, maxWidth: 1700, lineHeight: 1.28, ...reveal }}>{spoken.text}</p>
        ) : isFr && !wc && !imgRel ? (
          // L3+ French spoken, no picture available → keep the screen honestly blank.
          <p className="h1" style={{ color: 'var(--accent)', opacity: 0.28, fontWeight: 800 }}>• • •</p>
        ) : null}

        {isResponse ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 30 }}>
            <span style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 52, transform: `scale(${pulse})`, boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>{remaining}</span>
            <span className="h2" style={{ color: 'var(--accent)', fontWeight: 800 }}>Your turn</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  const imgPanel = imgRel ? (
    <div style={{ width: 1180, height: 1180, flexShrink: 0, borderRadius: 40, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,0.18)', border: '3px solid rgba(0,0,0,0.06)', background: 'var(--tint)', ...fadeUp(frame, fps, 6) }}>
      <Img src={assetSrc(imgRel)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
