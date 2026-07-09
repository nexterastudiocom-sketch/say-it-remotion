// technical.mjs — Layer 1: deterministic checks. Every value here is a fact a
// binary can measure exactly (resolution, codec, LUFS, runtime), so nothing in
// this file asks Claude anything. Fast, free, runs first, catches the most
// common render mistakes before we spend a cent on the vision layer.

import { ffprobeJson, runFfmpeg } from './ffmpeg.mjs';
import { PASS, FAIL, WARN, result } from './report.mjs';

function streamOf(probe, type) {
  return (probe.streams || []).find((s) => s.codec_type === type);
}

export async function checkTechnicalSpec(videoPath, spec) {
  let probe;
  try {
    probe = await ffprobeJson(videoPath);
  } catch (e) {
    return [result('technical_spec', FAIL, `ffprobe failed: ${e.message}`)];
  }

  const v = streamOf(probe, 'video');
  const a = streamOf(probe, 'audio');
  const out = [];

  if (!v) return [result('technical_spec', FAIL, 'no video stream found')];

  const [wantW, wantH] = spec.resolution;
  out.push(result('resolution',
    v.width === wantW && v.height === wantH ? PASS : FAIL,
    `${v.width}x${v.height} (want ${wantW}x${wantH})`));

  const [num, den] = (v.r_frame_rate || '0/1').split('/').map(Number);
  const fps = den ? Math.round((num / den) * 100) / 100 : 0;
  out.push(result('fps', Math.abs(fps - spec.fps) < 0.1 ? PASS : FAIL, `${fps} (want ${spec.fps})`));

  out.push(result('video_codec',
    v.codec_name === spec.video_codec ? PASS : FAIL,
    `${v.codec_name} (want ${spec.video_codec})`));

  const vBitrateMbps = Number(v.bit_rate || probe.format?.bit_rate || 0) / 1e6;
  out.push(result('video_bitrate',
    vBitrateMbps >= spec.min_video_bitrate_mbps ? PASS : WARN,
    `${vBitrateMbps.toFixed(1)} Mbps (floor ${spec.min_video_bitrate_mbps} Mbps)`));

  if (a) {
    out.push(result('audio_codec',
      a.codec_name === spec.audio_codec ? PASS : FAIL,
      `${a.codec_name} (want ${spec.audio_codec})`));
    const aKbps = Number(a.bit_rate || 0) / 1000;
    out.push(result('audio_bitrate',
      Math.abs(aKbps - spec.audio_bitrate_kbps) <= spec.audio_bitrate_tolerance_kbps ? PASS : WARN,
      `${aKbps.toFixed(0)} kbps (want ${spec.audio_bitrate_kbps} ±${spec.audio_bitrate_tolerance_kbps})`));
  } else {
    out.push(result('audio_codec', FAIL, 'no audio stream found'));
  }

  return out;
}

// Single-pass loudnorm measurement. A real integrated-LUFS number, not a vibe.
export async function checkLoudness(videoPath, target, tolerance) {
  const { stderr } = await runFfmpeg([
    '-i', videoPath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-',
  ]);
  const m = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) return result('loudness', FAIL, 'could not parse loudnorm output');
  const measured = Number(JSON.parse(m[0]).input_i);
  const ok = Math.abs(measured - target) <= tolerance;
  return result('loudness', ok ? PASS : FAIL,
    `${measured.toFixed(1)} LUFS integrated (want ${target} ±${tolerance})`);
}

// The strong runtime check: render length vs the sum of slide durations in this
// lesson's own JSON. If they diverge, either the render is stale or a segment
// was added/dropped — and it also tells the vision layer its timeline sampling
// may be off (see vision.mjs, which scales to compensate).
export async function checkRuntime(videoPath, expectedSeconds, tolerancePct) {
  const probe = await ffprobeJson(videoPath);
  const actual = Number(probe.format?.duration || 0);
  const tol = expectedSeconds * (tolerancePct / 100);
  const ok = Math.abs(actual - expectedSeconds) <= tol;
  const drift = actual - expectedSeconds;
  return result('runtime', ok ? PASS : WARN,
    `render ${(actual / 60).toFixed(2)} min vs lesson JSON ${(expectedSeconds / 60).toFixed(2)} min ` +
    `(drift ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}s, tol ±${tolerancePct}%)`,
    { actualSeconds: actual, expectedSeconds });
}

export async function videoDurationSeconds(videoPath) {
  const probe = await ffprobeJson(videoPath);
  return Number(probe.format?.duration || 0);
}

// Rough count of silence gaps — a smoke test for "did the pauses render at all",
// not a strict per-pause diff (that's the audio-diff layer's job).
export async function detectSilences(videoPath, noiseDb = -35, minDur = 0.4) {
  const { stderr } = await runFfmpeg([
    '-i', videoPath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-',
  ]);
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((x) => Number(x[1]));
  return starts.length;
}
