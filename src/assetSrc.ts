import { staticFile } from 'remotion';

// Asset paths in the lesson JSON are stored relative to the public/ folder
// (e.g. "assets/images/je.png"). Remotion 4.x requires public assets to be
// resolved through staticFile() — a bare relative <Img src> is rejected at
// render time. Absolute URLs (http/https/data/blob) are passed through
// unchanged so a hosted or inline image still works.
export const assetSrc = (src: string): string =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src);
