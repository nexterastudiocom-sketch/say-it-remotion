import { Config } from '@remotion/cli/config';

// Matches the existing Premiere Pro export spec:
// 3840x2160, 30fps, H.264, ~45Mbps VBR, AAC 384kbps
// (Composition width/height/fps are set per-Composition in Root.tsx;
// this controls encoding behavior at render time.)

Config.setOverwriteOutput(true);
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setVideoBitrate('45M');
Config.setAudioBitrate('384k');

// Final loudness normalization to -14 LUFS still runs through your
// existing FFmpeg QC pass after render — Remotion's audio mixing
// is not LUFS-precise on its own.
