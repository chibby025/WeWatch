import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { maybeRelocateMoov } from './mp4FastStart';

// Fixtures are generated fresh into a temp dir rather than committed as binary
// files — this codebase already requires ffmpeg/ffprobe on PATH everywhere else
// (backend HLS segmenting, this test's own playability verification), so
// generating them here adds no new dependency and keeps the test self-contained
// for CI without needing pre-existing files outside the repo.
let workDir;
let MOOV_AT_END;
let ALREADY_FASTSTART;

function findBoxOffsets(buf) {
  const text = buf.toString('latin1');
  return {
    ftyp: text.indexOf('ftyp') - 4,
    moov: text.indexOf('moov') - 4,
    mdat: text.indexOf('mdat') - 4,
  };
}

function ffprobeJson(args) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', ...args]);
  return JSON.parse(out.toString());
}

// Pipes the file through ffmpeg as a non-seekable stream (spawnSync with input via
// stdin, exactly like the backend's real FIFO does) and decodes every frame, failing
// if ffmpeg reports any decode error. This is the check that actually caught a real
// bug during development: a moov/stco-offset mistake that ffprobe's *metadata-only*
// checks (duration, codec name, dimensions — none of which read from stco/co64 at
// all) couldn't detect, but which broke real non-seekable playback outright, because
// a seekable reader can paper over a wrong offset by just seeking there; a pipe
// reader can't — it has no choice but to expect data at the exact right cumulative
// byte position.
function assertPipeDecodable(buf) {
  // execFileSync throws on non-zero exit; reaching here means ffmpeg exited 0 with
  // -v error (only logs actual errors) producing no output — i.e., no decode errors.
  execFileSync('ffmpeg', ['-v', 'error', '-i', '-', '-f', 'null', '-'], { input: buf });
}

describe('maybeRelocateMoov', () => {
  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'mp4faststart-test-'));
    MOOV_AT_END = join(workDir, 'moov_at_end.mp4');
    ALREADY_FASTSTART = join(workDir, 'already_faststart.mp4');

    // ffmpeg's default MP4 muxer writes moov last (it doesn't know final sample
    // counts/sizes until encoding finishes) — no special flag needed to reproduce
    // the "moov at end" case this fix targets.
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=8:size=320x240:rate=15',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', MOOV_AT_END]);
    execFileSync('ffmpeg', ['-y', '-i', MOOV_AT_END, '-c', 'copy', '-movflags', '+faststart', ALREADY_FASTSTART]);
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('relocates moov ahead of mdat for a moov-at-end file, preserving total size and playability', async () => {
    const originalBuf = readFileSync(MOOV_AT_END);
    const originalOffsets = findBoxOffsets(originalBuf);
    expect(originalOffsets.mdat).toBeLessThan(originalOffsets.moov); // confirm fixture is genuinely moov-at-end

    const file = new File([originalBuf], 'moov_at_end.mp4', { type: 'video/mp4' });
    const result = await maybeRelocateMoov(file);

    expect(result).not.toBe(file); // relocation should have actually happened
    expect(result.size).toBe(file.size); // same total bytes, just reordered

    const resultBuf = Buffer.from(await result.arrayBuffer());
    const newOffsets = findBoxOffsets(resultBuf);
    expect(newOffsets.moov).toBeLessThan(newOffsets.mdat); // now fast-start

    const outPath = join(workDir, 'relocated.mp4');
    writeFileSync(outPath, resultBuf);

    // Fast-start achieved: ffprobe must succeed against just a PARTIAL PREFIX —
    // exactly what the backend's progressive probe does (concatenated chunk prefix).
    const prefixPath = join(workDir, 'relocated_prefix.mp4');
    writeFileSync(prefixPath, resultBuf.subarray(0, newOffsets.moov + 20000)); // moov + a little mdat, nowhere near the full ~190KB file
    const probeInfo = ffprobeJson(['-show_entries', 'format=duration', prefixPath]);
    expect(parseFloat(probeInfo.format.duration)).toBeGreaterThan(0);

    // Full correctness: stream info (codec/dimensions/duration) must match the
    // original exactly — relocation must not alter any actual media content.
    const originalInfo = ffprobeJson(['-show_entries', 'stream=codec_name,width,height,duration,sample_rate', MOOV_AT_END]);
    const relocatedInfo = ffprobeJson(['-show_entries', 'stream=codec_name,width,height,duration,sample_rate', outPath]);
    expect(relocatedInfo.streams).toEqual(originalInfo.streams);

    // The real regression check: decode every frame via a non-seekable pipe, exactly
    // like the backend's FIFO. Throws (failing the test) on any decode error.
    expect(() => assertPipeDecodable(resultBuf)).not.toThrow();
  });

  it('leaves an already-fast-start file byte-identical (no-op pass-through)', async () => {
    const originalBuf = readFileSync(ALREADY_FASTSTART);
    const offsets = findBoxOffsets(originalBuf);
    expect(offsets.moov).toBeLessThan(offsets.mdat); // confirm fixture is genuinely already fast-start

    const file = new File([originalBuf], 'already_faststart.mp4', { type: 'video/mp4' });
    const result = await maybeRelocateMoov(file);

    expect(result).toBe(file); // pass-through — no wasted work, no risk to an already-good file
  });

  it('bails out to the original file for non-ISO-BMFF input without throwing', async () => {
    const file = new File(['hello, this is not an mp4 at all'], 'notes.txt', { type: 'text/plain' });
    const result = await maybeRelocateMoov(file);
    expect(result).toBe(file);
  });

  it('bails out to the original file for a corrupted/truncated mp4 without throwing', async () => {
    const originalBuf = readFileSync(MOOV_AT_END);
    const truncated = originalBuf.subarray(0, 100); // cuts off mid-mdat, long before moov
    const file = new File([truncated], 'truncated.mp4', { type: 'video/mp4' });
    const result = await maybeRelocateMoov(file);
    expect(result).toBe(file);
  });
});
