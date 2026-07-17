// MP4 "fast start" relocation — moves the moov atom to the front of the file,
// client-side, before a progressive device-stream upload begins.
//
// Why this exists: the backend's progressive-HLS pipeline (see chunk_upload.go /
// hls_progressive.go) detects whether a file is safe to stream progressively by
// running ffprobe against whatever upload chunks have landed so far. That only
// succeeds early if the file's structural index (the `moov` box) sits near the
// front — true for files exported with `+faststart`, false for plenty of ordinary
// exports where `moov` lands after `mdat` (often the entire rest of the file).
// Without this fix, those files fall back to "wait for the whole upload" — exactly
// the friction progressive streaming exists to remove.
//
// Why this doesn't require "scanning the whole 600MB": locating `moov` only
// requires reading box *headers* (8–16 bytes each) and skipping their content by
// jumping `offset += box.size` — `File.slice()` costs nothing until something
// reads from the resulting Blob, so this is a handful of microsecond-scale local
// reads regardless of how large `mdat` is. Only `moov` itself (typically hundreds
// of KB, rarely more than a few MB even for long recordings) is actually read into
// memory, to rewrite its internal chunk-offset tables.
//
// Any failure mode here returns the original File unchanged — this can only ever
// improve a file's progressive-streaming odds, never make one worse, since
// "give up and use the original" is exactly today's pre-existing behavior.

// 3GP is a constrained profile of the same ISO-BMFF box format (ftyp/moov/mdat) —
// the relocation algorithm below applies to it completely unchanged.
const ISO_BMFF_EXTENSIONS = ['mp4', 'm4v', 'mov', 'm4a', '3gp'];

// A moov this large signals something was parsed wrong (a real moov rarely
// exceeds a few MB even for multi-hour recordings) — bail rather than risk
// reading and rewriting a huge, likely-misidentified region.
const MAX_SANE_MOOV_SIZE = 50 * 1024 * 1024;

/**
 * Returns a File (same name/type as the input, so callers relying on those — chunk
 * upload tracking, resume-by-filename matching — keep working unmodified) with
 * `moov` relocated to the front (immediately after `ftyp` if present, otherwise at
 * file start) and every affected stco/co64 chunk-offset rewritten accordingly — or
 * the original `file` unchanged if relocation isn't applicable, isn't needed, or
 * can't be done safely. Never throws.
 */
export async function maybeRelocateMoov(file) {
  try {
    return await relocateMoovInternal(file);
  } catch (err) {
    console.warn('⚠️ [mp4FastStart] Relocation failed, uploading original file unchanged:', err);
    return file;
  }
}

async function relocateMoovInternal(file) {
  const ext = file.name?.split('.').pop()?.toLowerCase();
  if (!ISO_BMFF_EXTENSIONS.includes(ext)) return file;

  const boxes = await walkTopLevelBoxes(file);
  if (!boxes.length) return file;

  const moovIndex = boxes.findIndex((b) => b.type === 'moov');
  if (moovIndex === -1) return file; // no moov found at all (truncated probe, fragmented file, etc.)

  const sawMdatBeforeMoov = boxes.slice(0, moovIndex).some((b) => b.type === 'mdat');
  if (!sawMdatBeforeMoov) return file; // already fast-start — nothing to do

  const moovBox = boxes[moovIndex];
  if (moovBox.size > MAX_SANE_MOOV_SIZE) return file;

  const moovBuf = await file.slice(moovBox.offset, moovBox.offset + moovBox.size).arrayBuffer();
  const moovView = new DataView(moovBuf);

  if (!shiftChunkOffsets(moovView, moovBox.size)) return file; // mvex (fragmented), overflow, or malformed table — bail

  // ftyp may be absent or not be the first box (some encoders place `free`/`wide`
  // padding before ftyp, or omit ftyp entirely in older formats). Find it wherever
  // it sits rather than bailing. The shift amount is always +moovBox.size regardless
  // of where ftyp was: inserting moov before mdat shifts mdat's absolute offset by
  // exactly moov.size, irrespective of how other boxes are reordered.
  const ftypIndex = boxes.findIndex((b) => b.type === 'ftyp');
  const parts = [];
  if (ftypIndex !== -1) {
    const ftypBox = boxes[ftypIndex];
    parts.push(file.slice(ftypBox.offset, ftypBox.offset + ftypBox.size));
  }
  parts.push(moovBuf);
  for (let i = 0; i < boxes.length; i++) {
    if (i === ftypIndex || i === moovIndex) continue; // already placed
    const b = boxes[i];
    parts.push(file.slice(b.offset, b.offset + b.size));
  }

  console.log(`📦 [mp4FastStart] Relocated moov (${moovBox.size} bytes) ahead of mdat for ${file.name}`);
  // A File, not a plain Blob — callers (chunk upload tracking, resume-by-name
  // matching) read .name/.lastModified off whatever gets passed to them, same as
  // they would for the original File.
  return new File(parts, file.name, { type: file.type, lastModified: file.lastModified });
}

// Walks every top-level box, reading only headers (never box content) — cheap
// regardless of how large mdat is. Stops (without error) at the first box whose
// header can't be fully read, which naturally handles a truncated/probe-only file.
async function walkTopLevelBoxes(file) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= file.size) {
    const header = await readBoxHeader(file, offset);
    if (!header) break;
    const { headerSize, boxSize, type } = header;
    if (boxSize < headerSize || offset + boxSize > file.size + headerSize) break; // malformed
    const size = boxSize === 0 ? file.size - offset : boxSize; // size 0 == "extends to EOF", only valid for the last box
    boxes.push({ offset, size, type });
    if (boxSize === 0) break;
    offset += size;
  }
  return boxes;
}

async function readBoxHeader(file, offset) {
  const headBuf = await file.slice(offset, offset + 8).arrayBuffer();
  if (headBuf.byteLength < 8) return null;
  const dv = new DataView(headBuf);
  let boxSize = dv.getUint32(0);
  const type = readTypeFromView(dv, 4);
  let headerSize = 8;
  if (boxSize === 1) {
    const extBuf = await file.slice(offset + 8, offset + 16).arrayBuffer();
    if (extBuf.byteLength < 8) return null;
    const extDv = new DataView(extBuf);
    // Regular JS number arithmetic loses precision above 2^53 bytes (~9 petabytes)
    // — irrelevant for any real video file, and far simpler than BigInt for values
    // only ever used as Blob.slice() arguments (which require regular numbers).
    boxSize = extDv.getUint32(0) * 2 ** 32 + extDv.getUint32(4);
    headerSize = 16;
  }
  return { headerSize, boxSize, type };
}

function readTypeFromView(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

// Recursively walks moov > trak[] > mdia > minf > stbl looking for stco/co64 boxes,
// shifting every chunk-offset entry by +shiftAmount in place. Returns false (caller
// bails to the original file) if an mvex box is found (fragmented MP4 — a different
// streaming model this fix doesn't target), if any stco entry would overflow 32
// bits after the shift, or if the box structure looks malformed.
function shiftChunkOffsets(moovView, shiftAmount) {
  // moovView spans the WHOLE moov box, starting at its own [size][type] header —
  // walkContainer expects `start` to point at the first CHILD box, not the parent's
  // own header, so this must skip moov's header first (real bug found via testing:
  // walking from offset 0 made the walker misread moov's own header as a single
  // unrecognized child box of type "moov", do nothing, and exit immediately).
  let moovBoxSize = moovView.getUint32(0);
  let headerSize = 8;
  if (moovBoxSize === 1) headerSize = 16; // moov itself using the 64-bit largesize extension — vanishingly rare, but handle it
  return walkContainer(moovView, headerSize, moovView.byteLength, shiftAmount);
}

const RECURSE_INTO = new Set(['trak', 'mdia', 'minf', 'stbl']);

function walkContainer(view, start, end, shiftAmount) {
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = readTypeFromView(view, offset + 4);
    let headerSize = 8;
    let boxSize = size;
    if (size === 1) {
      if (offset + 16 > end) return false;
      boxSize = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      headerSize = 16;
    }
    if (boxSize < headerSize || offset + boxSize > end) return false;

    if (type === 'mvex') return false; // fragmented MP4 — not this fix's target
    if (RECURSE_INTO.has(type)) {
      if (!walkContainer(view, offset + headerSize, offset + boxSize, shiftAmount)) return false;
    } else if (type === 'stco') {
      if (!shiftStco(view, offset + headerSize, boxSize - headerSize, shiftAmount)) return false;
    } else if (type === 'co64') {
      shiftCo64(view, offset + headerSize, boxSize - headerSize, shiftAmount);
    }

    offset += boxSize;
  }
  return true;
}

// stco content: version+flags(4) entry_count(4) entries[entry_count](4 each, uint32 BE)
function shiftStco(view, contentStart, contentLen, shiftAmount) {
  if (contentLen < 8) return false;
  const entryCount = view.getUint32(contentStart + 4);
  const entriesStart = contentStart + 8;
  if (entriesStart + entryCount * 4 > contentStart + contentLen) return false;
  for (let i = 0; i < entryCount; i++) {
    const pos = entriesStart + i * 4;
    const next = view.getUint32(pos) + shiftAmount;
    if (next > 0xffffffff) return false; // would overflow 32 bits — bail rather than corrupt
    view.setUint32(pos, next);
  }
  return true;
}

// co64 content: version+flags(4) entry_count(4) entries[entry_count](8 each, uint64 BE)
function shiftCo64(view, contentStart, contentLen, shiftAmount) {
  if (contentLen < 8) return true; // nothing to shift
  const entryCount = view.getUint32(contentStart + 4);
  const entriesStart = contentStart + 8;
  const shiftBig = BigInt(shiftAmount);
  for (let i = 0; i < entryCount; i++) {
    const pos = entriesStart + i * 8;
    view.setBigUint64(pos, view.getBigUint64(pos) + shiftBig);
  }
  return true;
}
