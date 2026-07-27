/**
 * Style lock for "Say It" — European clean-line comic style.
 *
 * Used two ways:
 *   1. To generate the anchor images you hand-pick when training the Firefly /
 *      Recraft Custom Model.
 *   2. As a light reinforcement suffix on per-segment prompts (the Custom
 *      Model carries most of the weight; restating a few style words helps
 *      edge cases, and it's the only style signal until the model is trained).
 *
 * BRIEF RULE (non-negotiable): a per-image brief is ALWAYS a full scene
 * description — setting, who is in it, what they are doing, mood — never one or
 * two words. Recraft needs a scene, not a label.
 */
// The full locked style, verbatim source of truth / training text.
export const STYLE_FULL = `Modern ligne claire editorial illustration, Hergé tradition, contemporary print craft.

COLOUR: rich, highly saturated, varied palette — never one or two hue families.

DEPTH: three planes — background, midground, foreground subject. Each flatter and lower in contrast than the one in front.

TEXTURE: subtle halftone, fine, even, unobtrusive.

CHARACTERS: naturalistic adult anatomy, believable hands, natural stance and weight, mature face with subtle asymmetry, defined cheekbones, natural nose and lips, true-to-life eye spacing and skin tone. Defined brows and lashes, soft rosy blush. Calm readable emotion, understated believable gesture. Warm, alive.

COMPOSITION: square 1:1`;

// The locked NEGATIVE list (verbatim). Recraft's generations endpoint has no
// separate negative field, so the load-bearing negatives are folded into the tail
// of STYLE_DESCRIPTOR; this is kept for reference / training / a future endpoint.
export const NEGATIVE =
  'gradient, soft shading, airbrush, glow, painterly, 3D, photorealistic, muted, ' +
  'desaturated, sparse, flat single-colour background, cartoonish proportions, ' +
  'doll-like features, exaggerated anatomy, skin tone, expressions, overacted gestures, ' +
  'text, letters, numbers, signage, logos, watermark';

// Compressed to fit Recraft's 1000-char prompt cap alongside a full scene brief.
// Keeps the load-bearing cues + the negatives inline (no separate negative field).
export const STYLE_DESCRIPTOR =
  'Modern ligne claire editorial illustration, Hergé tradition. Rich, highly saturated, VARIED ' +
  'palette — never one or two hue families. Three flat depth planes, contrast falling with ' +
  'distance. Subtle fine even halftone. Naturalistic adult anatomy, believable hands, natural ' +
  'stance, mature face with subtle asymmetry, natural features, true-to-life skin tone, defined ' +
  'brows and lashes, soft blush, calm understated emotion. Square 1:1. ' +
  'NEGATIVE: gradient, soft shading, airbrush, glow, painterly, 3D, photorealistic, muted, ' +
  'desaturated, sparse, flat single-colour background, cartoonish proportions, doll-like features, ' +
  'exaggerated anatomy or skin tone, exaggerated or overacted expressions; no text, letters, ' +
  'numbers, signage, logos or watermark.';

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
