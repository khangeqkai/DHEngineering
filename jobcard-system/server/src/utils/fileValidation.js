const path = require('path');

// Node's `Buffer.from(str, 'base64')` is lenient: it silently drops invalid
// characters and ignores misaligned padding, so a truncated or scrambled upload
// decodes to a "valid" but broken file with no error. These helpers add the
// objection Node never raises — they reject an upload that didn't survive the
// trip intact, before anything is written to disk.

// Strict base64: the standard alphabet, padded to a multiple of 4 chars.
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decode base64 only if it round-trips cleanly. Returns a Buffer, or throws an
 * Error with a plain-English message a route can pass straight back to the user.
 *
 * Catches transport truncation/scrambling: those break the base64 alignment or
 * alphabet, so the strict pattern check and/or the re-encode comparison fail.
 */
function decodeBase64Strict(input) {
  if (typeof input !== 'string') {
    throw new Error('Upload looks corrupted or incomplete — please try again');
  }
  // Tolerate surrounding whitespace (some clients wrap long strings) but nothing else.
  const normalized = input.trim();
  if (!normalized || normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    throw new Error('Upload looks corrupted or incomplete — please try again');
  }
  const buffer = Buffer.from(normalized, 'base64');
  // Re-encode and compare: if Node had to drop anything to decode, this won't match.
  if (buffer.toString('base64') !== normalized) {
    throw new Error('Upload looks corrupted or incomplete — please try again');
  }
  return buffer;
}

// Leading-byte signatures for the file types we accept. A file whose header
// doesn't match its claimed extension is either the wrong type or has a mangled
// header — either way, not what it says it is.
function matchesSignature(buffer, ext) {
  const b = buffer;
  switch (ext) {
    case '.pdf':
      return b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
    case '.jpg':
    case '.jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case '.png':
      return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
        && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
    case '.gif':
      return b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38; // GIF8
    case '.bmp':
      return b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d; // BM
    case '.tif':
    case '.tiff':
      return b.length >= 4 && (
        (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || // II*\0 little-endian
        (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)    // MM\0* big-endian
      );
    default:
      return true; // unknown extension: nothing to check against (validators gate this elsewhere)
  }
}

/**
 * Throw if the decoded bytes don't carry the signature for the filename's
 * extension. Plain-English message for the route to surface.
 */
function assertMatchesExtension(buffer, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!matchesSignature(buffer, ext)) {
    throw new Error('This file looks damaged or is not the type its name says — please try again');
  }
}

module.exports = { decodeBase64Strict, assertMatchesExtension };
