// Deterministic font loading for render + studio.
// The Mosaic design system uses Rubik (display/headings), Hanken Grotesk (body)
// and JetBrains Mono (eyebrows, counters, system voice). Loading them through
// @remotion/google-fonts registers the real families that lesson-system.css
// references and makes Remotion wait for them before capturing frames (no FOUT /
// wrong-metrics flashes). Replaces the network @import in the stylesheet.
import { loadFont as loadRubik } from '@remotion/google-fonts/Rubik';
import { loadFont as loadHanken } from '@remotion/google-fonts/HankenGrotesk';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// subsets:['latin'] only — the deck is French/Latin, so we don't need latin-ext,
// cyrillic, greek, etc. This cuts font network requests ~5x per render tab, which
// removes the per-frame font-load stalls that were timing out batch renders.
loadRubik('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });
loadHanken('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });
loadHanken('italic', { weights: ['400', '500'], subsets: ['latin'] });
loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });
