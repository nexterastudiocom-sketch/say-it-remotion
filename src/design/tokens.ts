// Typed accessors over src/design/tokens.json — the single source of truth for
// colour. Types are DERIVED from the JSON keys (not hand-copied), so adding a level
// or language to the JSON updates the unions automatically. No hex literal appears
// here or in any consumer; everything reads from the token.

import tokens from './tokens.json';

// Unions derived from the JSON keys.
export type CEFRLevel = Exclude<keyof typeof tokens.level, '$comment'>;
export type LanguageName = Exclude<keyof typeof tokens.language, '$comment'>;

export type LevelToken = { hex: string; on: string; band: string; step: string; hue: number };
export type LanguageToken = { accent: string };

const LEVELS = tokens.level as Record<string, LevelToken>;
const LANGS = tokens.language as Record<string, LanguageToken>;

// Unknown level/language THROWS — a silently wrong badge is worse than a failed
// render. Never fall back to a default colour.
export function levelToken(level: string): LevelToken {
  const t = LEVELS[level];
  if (!t) throw new Error(`Unknown CEFR level "${level}" — no design token. Known: ${CEFR_LEVELS.join(', ')}`);
  return t;
}
export function languageToken(language: string): LanguageToken {
  const t = LANGS[language];
  if (!t) throw new Error(`Unknown language "${language}" — no design token. Known: ${LANGUAGE_NAMES.join(', ')}`);
  return t;
}

export const CEFR_LEVELS = Object.keys(tokens.level).filter((k) => k !== '$comment') as CEFRLevel[];
export const LANGUAGE_NAMES = Object.keys(tokens.language).filter((k) => k !== '$comment') as LanguageName[];

export const hud = tokens.hud;
export const constraints = tokens.constraints;
