import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeUp } from '../anim';
import { PracticeSlide as PracticeSlideData, Beat } from '../types';

/**
 * Practice / drill slide for the call-and-response segments (recall, mix-it-up,
 * speed round, capstone) plus short culture/writing notes.
 *
 * It reads its OWN beats and the current frame to teach the way the audio does:
 * show the English cue while the learner is prompted → reveal the French answer
 * exactly as it's spoken → a pulsing "À toi !" mic cue during the silent pause
 * where the learner speaks. A `note` kind instead shows one calm text card.
 */
export const PracticeSlide: React.FC<{ slide: PracticeSlideData & { beats?: Beat[] } }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const beats = slide.beats ?? [];
  const sf = (s: number) => Math.round(s * fps);

  // A short note (culture / writing / scorecard) — one steady card.
  if (slide.kind === 'note' || !beats.length) {
    return (
      <AbsoluteFill>
        <div className="content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span className="eyebrow accent-text" style={{ color: 'var(--accent)', marginBottom: 48, ...fadeUp(frame, fps) }}>
            {slide.eyebrow}
          </span>
          <div className="card pad" style={{ padding: '72px 96px', maxWidth: 2600, ...fadeUp(frame, fps, 6) }}>
            <p className="h2" style={{ color: 'var(--ink)', fontWeight: 600, lineHeight: 1.34 }}>
              {slide.note || slide.heading}
            </p>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const isFr = (v?: string) => !!v && v.startsWith('fr');
  const isEn = (v?: string) => !!v && v.startsWith('en');

  // Beat start frames + the active beat at the current frame.
  const starts: number[] = [];
  { let c = 0; for (const b of beats) { starts.push(c); c += sf(b.durationInSeconds); } }
  let activeIdx = beats.length - 1;
  for (let i = 0; i < beats.length; i++) {
    if (frame >= starts[i] && frame < starts[i] + sf(beats[i].durationInSeconds)) { activeIdx = i; break; }
  }
  const inPause = !beats[activeIdx]?.src;

  // The most recently SPOKEN beat at/before now — this is what should be on
  // screen, and it STAYS there through the following silent pause so the visible
  // line always matches what was just heard (no blank-then-mic flicker).
  let spokenIdx = -1;
  for (let i = activeIdx; i >= 0; i--) { if (beats[i].src) { spokenIdx = i; break; } }
  const spoken = beats[spokenIdx] || ({} as Beat);
  const spokenIsFr = spokenIdx >= 0 && isFr(spoken.voice);
  const spokenIsEn = spokenIdx >= 0 && isEn(spoken.voice);
  const reveal = fadeUp(Math.max(0, frame - (starts[spokenIdx] ?? 0)), fps);
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2.2);

  // A substantial silent pause after a spoken line = the learner's turn to answer.
  // Show a live countdown so they know how long they have. (Short settle/hold
  // pauses < 2s get no timer.)
  const activePause = inPause ? beats[activeIdx] : undefined;
  const pauseDur = activePause ? activePause.durationInSeconds : 0;
  const isResponsePause = inPause && pauseDur >= 2 && spokenIdx >= 0;
  const remaining = isResponsePause ? Math.max(1, Math.ceil(pauseDur - (frame - (starts[activeIdx] ?? 0)) / fps)) : 0;

  return (
    <AbsoluteFill>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 48 }}>
        <span className="eyebrow accent-text" style={{ color: 'var(--accent)', ...fadeUp(frame, fps) }}>
          {slide.eyebrow}
        </span>

        <div style={{ minHeight: 360, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 44 }}>
          {/* What was just spoken — French big (lesson content), English as a prompt. */}
          {spokenIsFr ? (
            <p className="h1" style={{ color: 'var(--accent)', fontWeight: 800, ...reveal }}>
              {spoken.text}
            </p>
          ) : spokenIsEn ? (
            <p className="h2" style={{ color: 'var(--ink)', fontWeight: 600, maxWidth: 2600, lineHeight: 1.28, ...reveal }}>
              {spoken.text}
            </p>
          ) : null}

          {/* Learner's turn — countdown timer + English label. */}
          {isResponsePause ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 30 }}>
              <span style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 52, boxShadow: '0 12px 40px rgba(0,0,0,0.22)', transform: `scale(${pulse})` }}>
                {remaining}
              </span>
              <span className="h2" style={{ color: 'var(--accent)', fontWeight: 800 }}>Your turn</span>
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
