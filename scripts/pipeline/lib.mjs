// Shared utilities for the lesson→video generation loop:
// config, content/config hashing, the persistent status store, structured
// logging, backoff, and manifest/report writers. No side effects on import.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REMOTION = path.join(ROOT, 'node_modules/.bin/remotion'); // bundles ffprobe + ffmpeg
export const DIRS = {
  status: path.join(ROOT, 'pipeline/status'),
  manifests: path.join(ROOT, 'pipeline/manifests'),
  reports: path.join(ROOT, 'pipeline/reports'),
  logs: path.join(ROOT, 'pipeline/logs'),
  films: path.join(ROOT, 'out/films'),
  covers: path.join(ROOT, 'public/assets/covers'),
};

export const PIPELINE_VERSION = '1.0.0';
export const STATUSES = ['pending', 'validating-source', 'planning', 'generating-script',
  'generating-audio', 'validating-audio', 'generating-images', 'composing', 'rendering',
  'validating-final', 'repairing', 'needs-review', 'completed', 'approved', 'skipped'];

export async function loadConfig() {
  return JSON.parse(await readFile(path.join(ROOT, 'config/pipeline.json'), 'utf8'));
}

// ---- hashing (drives "does this need regeneration?") ----------------------
export const sha256 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
export async function hashFiles(files) {
  const h = createHash('sha256');
  for (const f of files.sort()) {
    const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
    if (existsSync(abs)) h.update(await readFile(abs));
  }
  return h.digest('hex').slice(0, 16);
}

// ---- persistent status store (one JSON per lesson) ------------------------
export async function readStatus(lessonId) {
  const f = path.join(DIRS.status, `${lessonId}.json`);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null;
}
export async function writeStatus(lessonId, patch) {
  await mkdir(DIRS.status, { recursive: true });
  const prev = (await readStatus(lessonId)) || {
    lessonId, pipelineVersion: PIPELINE_VERSION, attempts: 0, assets: {},
    validations: {}, history: [], status: 'pending', createdAt: nowISO(),
  };
  const next = { ...prev, ...patch, updatedAt: nowISO() };
  await writeFile(path.join(DIRS.status, `${lessonId}.json`), JSON.stringify(next, null, 2) + '\n');
  return next;
}
export async function allStatuses() {
  if (!existsSync(DIRS.status)) return [];
  const files = (await readdir(DIRS.status)).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(DIRS.status, f), 'utf8'))));
}

// nowISO is injected (Date is fine in these scripts — they are not Workflow scripts).
export const nowISO = () => new Date().toISOString();

// ---- structured logging (JSONL) -------------------------------------------
export async function log(lessonId, event, data = {}) {
  await mkdir(DIRS.logs, { recursive: true });
  const line = JSON.stringify({ t: nowISO(), lessonId, event, ...data }) + '\n';
  await writeFile(path.join(DIRS.logs, `${lessonId}.log.jsonl`), line, { flag: 'a' });
  process.stdout.write(`  [${lessonId}] ${event}${data.msg ? ' — ' + data.msg : ''}\n`);
}

// ---- backoff for transient API failures -----------------------------------
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function withRetry(fn, { tries, backoffMs, backoffFactor, maxBackoffMs }, onRetry) {
  let delay = backoffMs, lastErr;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(i); } catch (e) {
      lastErr = e;
      if (i === tries) break;
      onRetry && onRetry(i, e, delay);
      await sleep(delay);
      delay = Math.min(delay * backoffFactor, maxBackoffMs);
    }
  }
  throw lastErr;
}

// ---- run a child process, capture stdout+stderr ---------------------------
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '', err }));
  });
}

// ---- manifest + report writers --------------------------------------------
export async function writeManifest(lessonId, manifest) {
  await mkdir(DIRS.manifests, { recursive: true });
  await writeFile(path.join(DIRS.manifests, `${lessonId}.manifest.json`), JSON.stringify(manifest, null, 2) + '\n');
}
export async function writeReport(lessonId, report) {
  await mkdir(DIRS.reports, { recursive: true });
  await writeFile(path.join(DIRS.reports, `${lessonId}.report.json`), JSON.stringify(report, null, 2) + '\n');
}
