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
export const STYLE_DESCRIPTOR =
  'ligne claire, European clean-line illustration style: bold uniform-weight ' +
  'ink outlines, flat solid color fills, no gradient shading, no cross-hatching, ' +
  'clean crisp shapes, warm but bright color palette, clear and simple, ' +
  'no text, no speech bubbles, no logos';

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
