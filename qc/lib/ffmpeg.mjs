// ffmpeg.mjs — thin wrapper around Remotion's bundled ffmpeg/ffprobe.
//
// There is NO system ffmpeg on this machine. Remotion ships its own static
// build inside node_modules/@remotion/compositor-<platform>/, but the binaries
// link against sibling .dylib/.so files there, so they only run with the
// library path pointed at that directory. We resolve the binary + set that env
// once, here, so the rest of the harness never has to think about it.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);

// Map Node's platform/arch to Remotion's compositor package name.
function compositorPackage() {
  const p = process.platform; // 'darwin' | 'linux' | 'win32'
  const a = process.arch; // 'arm64' | 'x64'
  if (p === 'darwin') return a === 'arm64' ? '@remotion/compositor-darwin-arm64' : '@remotion/compositor-darwin-x64';
  if (p === 'win32') return '@remotion/compositor-win32-x64-msvc';
  if (p === 'linux') return a === 'arm64' ? '@remotion/compositor-linux-arm64-gnu' : '@remotion/compositor-linux-x64-gnu';
  throw new Error(`Unsupported platform for bundled ffmpeg: ${p}/${a}`);
}

function resolveCompositorDir() {
  const pkg = compositorPackage();
  try {
    // Resolve via the package's package.json so we get its real install dir
    // even under hoisting / pnpm.
    return dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    // Fallback: assume flat node_modules next to the project root.
    const guess = join(process.cwd(), 'node_modules', ...pkg.split('/'));
    if (existsSync(guess)) return guess;
    throw new Error(
      `Could not locate ${pkg}. Is Remotion installed? (npm install in the project root)`,
    );
  }
}

const COMPOSITOR_DIR = resolveCompositorDir();
const EXE = process.platform === 'win32' ? '.exe' : '';
export const FFMPEG = join(COMPOSITOR_DIR, `ffmpeg${EXE}`);
export const FFPROBE = join(COMPOSITOR_DIR, `ffprobe${EXE}`);

// The env every ffmpeg/ffprobe call needs so the dynamic linker finds the
// sibling libav*/libsw* libraries. macOS uses DYLD_*, Linux LD_LIBRARY_PATH,
// Windows finds DLLs in the same dir automatically.
const LIB_ENV = (() => {
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    env.DYLD_LIBRARY_PATH = [COMPOSITOR_DIR, env.DYLD_LIBRARY_PATH].filter(Boolean).join(':');
    env.DYLD_FALLBACK_LIBRARY_PATH = [COMPOSITOR_DIR, env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(':');
  } else if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [COMPOSITOR_DIR, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  return env;
})();

export function assertBinaries() {
  for (const [name, path] of [['ffmpeg', FFMPEG], ['ffprobe', FFPROBE]]) {
    if (!existsSync(path)) throw new Error(`Bundled ${name} not found at ${path}`);
  }
}

// ffmpeg writes almost everything (loudnorm/silencedetect JSON, progress) to
// stderr and exits non-zero on a null muxer run, so we capture both streams and
// never throw on exit code — callers parse stderr themselves.
export async function runFfmpeg(args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  try {
    const { stdout, stderr } = await execFileP(FFMPEG, args, { env: LIB_ENV, maxBuffer });
    return { stdout, stderr, code: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? String(e), code: e.code ?? 1 };
  }
}

export async function ffprobeJson(videoPath) {
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath];
  const { stdout } = await execFileP(FFPROBE, args, { env: LIB_ENV, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

// Grab one frame at time t (seconds), downscaled to `scaleWidth` px wide to
// keep vision token cost sane. Returns the output path, or null on failure.
export async function extractFrame(videoPath, t, outPath, scaleWidth = 1280) {
  const args = [
    '-y', '-ss', String(t), '-i', videoPath, '-frames:v', '1',
    '-vf', `scale=${scaleWidth}:-1`, '-q:v', '3', outPath,
  ];
  const { code } = await runFfmpeg(args);
  return code === 0 && existsSync(outPath) ? outPath : null;
}

export { LIB_ENV, COMPOSITOR_DIR };
