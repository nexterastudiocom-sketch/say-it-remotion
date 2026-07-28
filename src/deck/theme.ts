import { LanguageCode } from './types';
import config from '../../config/languages.json';

// Per-language brand color package. Source of truth is config/languages.json,
// editable from the studio's Config page, so colors drive both the lesson
// (accent/tint) and the Warm-Spark thumbnail (accent + spark set).
export type Spark = { ring: string; chip: string; dot: string; badgeBg: string; badgeFg: string; badgeDot: string };
export type LanguageTheme = {
  code: LanguageCode;
  slug: string;
  englishName: string;
  accent: string;
  tint: string;
  spark: Spark;
};

const raw = config as {
  levels: string[];
  languages: Record<string, { name: string; slug: string; accent: string; tint: string; spark: Spark }>;
};

export const LEVELS = raw.levels;

export const LANGUAGES: Record<LanguageCode, LanguageTheme> = Object.fromEntries(
  Object.entries(raw.languages).map(([code, l]) => [
    code,
    { code: code as LanguageCode, slug: l.slug, englishName: l.name, accent: l.accent, tint: l.tint, spark: l.spark },
  ])
) as Record<LanguageCode, LanguageTheme>;

// Mosaic mark, keyed by language code (mark-fr.svg …). Tonal variant for the
// header on Paper/Bone grounds; reverse variants exist for Ink grounds.
export const monogramLogo = (code: LanguageCode) => `assets/logo/mark-${code}.svg`;
export const horizontalLogo = (code: LanguageCode) => `assets/logo/horizontal-${LANGUAGES[code].slug}.png`;
