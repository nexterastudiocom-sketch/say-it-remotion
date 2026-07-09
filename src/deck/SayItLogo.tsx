import React from 'react';

// Faithful rebuild of the "Say ıt" primary logo (from primary-*.svg), with the
// accent speech-bubble that forms the dot of the dotless "ı" exposed as an
// animatable element. Geometry (viewBox, text metrics, bubble transform) is
// copied exactly from the brand SVG so the static logo is pixel-identical.

const BUBBLE_PATH =
  'M44 8 H76 A36 36 0 0 1 112 44 V52 A36 36 0 0 1 76 88 H58 L36 106 C32.5 108.7 28 106 28.6 101.6 L30.5 87.2 A36 36 0 0 1 8 52 V44 A36 36 0 0 1 44 8 Z';

export type DotAnim = {
  /** Vertical offset added to the bubble's resting position (SVG units). */
  dropY: number;
  /** Uniform scale of the bubble around its own centre (1 = resting size). */
  scale: number;
  /** Bubble opacity 0..1. */
  opacity: number;
  /** Small rotation in degrees, around the bubble centre. */
  rotate?: number;
};

export const SayItLogo: React.FC<{
  accent: string;
  ink?: string;
  dot: DotAnim;
  style?: React.CSSProperties;
  className?: string;
}> = ({ accent, ink = '#16181D', dot, style, className }) => (
  <svg
    viewBox="-6.4 -22.2 260.9 140.6"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Say It"
    style={style}
    className={className}
  >
    <text
      x="0"
      y="80"
      fill={ink}
      fontFamily="Poppins, sans-serif"
      fontWeight={700}
      fontSize={92}
      letterSpacing={-3}
    >
      Say ıt
    </text>
    <g transform={`translate(179.54, ${-6.33 + dot.dropY}) scale(0.3067)`} opacity={dot.opacity}>
      <path
        d={BUBBLE_PATH}
        fill={accent}
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: `scale(${dot.scale}) rotate(${dot.rotate ?? 0}deg)`,
        }}
      />
    </g>
  </svg>
);
