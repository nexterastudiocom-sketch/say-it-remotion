import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';

// One generic, frame-aware slide that renders any of the 12 Method stages from
// the baked beat data. The load-bearing rule is X-06: French text appears ONLY
// when the currently/last-spoken beat is below L3 — at L3+ (retrieval) the screen
// must not show the answer. English prompts show as-is; a countdown marks the
// learner's turn during a production pause.

const STAGE_LABEL: Record<string, string> = {
  CAN_DO_GOAL: 'Your goal', WARM_UP: 'Warm up', COLD_INPUT: 'Listen',
  ITEM_BLOCK: 'New word', MICRO_RECALL: 'Quick check', FRAME_INTRO: 'Build a sentence',
  BUILD_LADDER: 'Build it', INPUT_RETURN: 'Listen again', MAKE_IT_YOURS: 'Make it yours',
  TRANSFER_TASK: 'Your turn', FLUENCY_ROUND: 'Fluency', CAN_DO_CHECK: 'You can now',
};

type Beat = { voice?: string; text?: string; level?: number; durationInSeconds: number; stage?: string; visuals?: string[] };

export const MethodSlide: React.FC<{ slide: { stage?: string; visual?: string; beats?: Beat[] } }> = ({ slide }) => {
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
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2.2);

  // X-06: French on screen only below L3.
  const showFr = isFr && level >= 0 && level < 3;
  const label = STAGE_LABEL[slide.stage || ''] || slide.stage || '';
  const vis = (slide.visual || '');

  // Word card (ITEM_BLOCK MEET, L0): item + phonetic from the directive.
  const wc = level < 3 ? vis.match(/WORD CARD — ([^·]+?)·\s*\[([^\]]+)\]/) : null;

  const pauseDur = inPause ? active.durationInSeconds : 0;
  const isResponse = inPause && pauseDur >= 2 && si >= 0;
  const remaining = isResponse ? Math.max(1, Math.ceil(pauseDur - (frame - (starts[ai] ?? 0)) / fps)) : 0;

  return (
    <AbsoluteFill>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 48 }}>
        <span className="eyebrow accent-text" style={{ color: 'var(--accent)', ...fadeUp(frame, fps) }}>{label}</span>

        {wc ? (
          <div style={{ ...fadeUp(frame, fps, 4) }}>
            <p className="h1" style={{ color: 'var(--accent)', fontWeight: 800 }}>{wc[1].trim()}</p>
            <p className="body" style={{ marginTop: 12, letterSpacing: 2 }}>[{wc[2].trim()}]</p>
          </div>
        ) : null}

        <div style={{ minHeight: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
          {showFr && !wc ? (
            <p className="h1" style={{ color: 'var(--accent)', fontWeight: 800, ...reveal }}>{spoken.text}</p>
          ) : isEn ? (
            <p className="h2" style={{ color: 'var(--ink)', fontWeight: 600, maxWidth: 2600, lineHeight: 1.28, ...reveal }}>{spoken.text}</p>
          ) : isFr && !wc ? (
            // L3+ French is spoken but must NOT appear on screen (X-06).
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
    </AbsoluteFill>
  );
};
