/**
 * Style lock for "Say It" — European clean-line comic style.
 *
 * Used two ways:
 *   1. To generate the anchor images you hand-pick when training the Firefly
 *      Custom Model (via the Firefly web app).
 *   2. As a light reinforcement suffix on per-segment prompts (the Custom
 *      Model carries most of the weight; restating a few style words helps
 *      edge cases, and it's the only style signal until the model is trained).
 */
// The full locked style, for reference / training a custom style_id. Too long for
// Recraft's 1000-char prompt cap on its own, so per-image prompts use the
// compressed STYLE_DESCRIPTOR below (which preserves the load-bearing cues).
export const STYLE_FULL = `Modern ligne claire editorial illustration in the Hergé tradition, elevated with contemporary print craft.
LINE: bold confident black ink contours on the focal subject, finer interior linework for detail, lightest weight on background elements. Clean deliberate strokes, no sketchiness, no wobble.
COLOUR: vivid, bold, HIGHLY saturated high-contrast palette — punchy complementary colour pairings, deep rich darks against bright clean lights, maximum chroma. Every form rendered in TWO OR THREE FLAT TONES — a base colour plus a hard-edged shadow shape and optional highlight shape. Absolutely no gradients, no soft blending, no airbrush, no glow, nothing muted, pastel or washed out. The tones are separate flat shapes with crisp borders.
DEPTH: three distinct planes — background environment, midground context, foreground subject. Each plane flatter and lighter in contrast than the one in front of it.
TEXTURE: subtle halftone dot grain across the whole image, like offset lithography. Fine, even, unobtrusive.
DETAIL: generous environmental detail — architecture, props, patterned clothing, set dressing that tells you where you are. Rich, never cluttered.
CHARACTERS: expressive faces with defined brows, lashes, blush, and clear readable emotion. Dynamic gesture and posture. Warm, charming, alive.
COMPOSITION: one dominant focal subject occupying 55-65% of the frame. Background supports it, never competes. Square 1:1.`;

// Compressed to fit Recraft's 1000-char prompt cap. Keeps the load-bearing cues:
// ligne claire, FLAT two/three-tone (no gradients), halftone grain, three planes,
// detailed environment, one focal subject. Ends with the negative cues inline
// (Recraft has no separate negative field on this endpoint), hardened against the
// model's habit of stamping fake signage and a corner signature.
export const STYLE_DESCRIPTOR =
  'Modern ligne claire editorial illustration, Hergé tradition. Bold confident black ink ' +
  'contours on the focal subject, finer interior linework, lightest lines on background. ' +
  'Vivid, bold, HIGHLY saturated high-contrast palette — punchy complementary colours, deep ' +
  'rich darks against bright clean lights, maximum chroma. Every form in just TWO or THREE FLAT ' +
  'tones — base colour plus a hard-edged shadow shape and optional highlight — crisp borders, ' +
  'absolutely no gradients, no soft shading, no airbrush, no glow, nothing muted or washed out. ' +
  'Three flat depth planes, each lighter ' +
  'behind. Subtle even halftone dot grain like offset lithography. Generous environmental ' +
  'detail: architecture, props, set dressing. Expressive charming face, dynamic posture. ' +
  'One dominant subject filling 55-65% of a square frame. Blank unlettered signs only. ' +
  'No text, no letters, no words, no numbers, no shop names, no signage, no speech bubbles, ' +
  'no logos, no signature, no watermark, not photorealistic, not painterly, not muted.';

// Build a per-image prompt within Recraft's 1000-char cap. If brief+style overflows,
// the style is trimmed at a sentence boundary (the brief is never truncated).
export function stylePrompt(brief, maxLen = 1000) {
  const b = String(brief).trim().replace(/\s+/g, ' ');
  let p = `${b}. ${STYLE_DESCRIPTOR}`;
  if (p.length <= maxLen) return p;
  let style = STYLE_DESCRIPTOR;
  while (`${b}. ${style}`.length > maxLen && style.includes('.')) style = style.slice(0, style.lastIndexOf('.', style.length - 2) + 1);
  return `${b}. ${style}`.slice(0, maxLen);
}

/**
 * Anchor prompts for the initial training set — deliberately varied across
 * people/pronouns, verbs, places, and objects so the trained model
 * generalizes across the whole A1 spine, not just one theme.
 */
export const ANCHOR_PROMPTS = [
  // People / pronouns
  'a single person standing, simple pose, plain background',
  'two people facing each other mid-conversation',
  'a person waving hello',
  // Verbs / actions
  'a person sitting at a desk writing',
  'a person eating at a small table',
  'a person sleeping in bed',
  'a person walking with a bag',
  'a person speaking with a speech gesture, no text',
  'a person reading a book on a chair',
  'a person cooking at a stove',
  // Places
  'a cozy café with small round tables',
  'a city street with narrow buildings',
  'a countryside landscape with rolling hills',
  'a simple house exterior with a front door',
  'a train arriving at a small station',
  // Objects
  'a cup of coffee on a table',
  'an open book on a desk',
  'a bicycle leaning against a wall',
  'a suitcase and a map',
  'a clock on a wall',
];
