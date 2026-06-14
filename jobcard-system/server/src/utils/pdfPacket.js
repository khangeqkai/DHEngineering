const { PDFDocument, PageSizes } = require('pdf-lib');
const sharp = require('sharp');

const logger = require('./logger');

// Weld a job's paperwork into one combined PDF: the generated job card first,
// then the chosen on-disk files in order. PDFs are merged page-for-page (their
// own page size/orientation preserved — a landscape A3 drawing stays A3). Images
// are normalised through sharp to PNG (so every input format works and CMYK /
// progressive JPEGs that pdf-lib can't embed directly are handled) and placed
// one per A4 page, scaled to fit. A file that can't be read or decoded is skipped
// and reported rather than failing the whole packet.

const [A4_W, A4_H] = PageSizes.A4; // points (595.28 x 841.89)
const MARGIN = 18; // ~6.3mm white border around drawn images

const PDF_EXT = '.pdf';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif']);

async function appendPdf(out, bytes) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach(p => out.addPage(p));
}

async function appendImage(out, bytes) {
  // Normalise any image format to a baseline PNG buffer pdf-lib can embed.
  const pngBytes = await sharp(bytes).png().toBuffer();
  const img = await out.embedPng(pngBytes);

  const page = out.addPage([A4_W, A4_H]);
  const scale = Math.min(
    (A4_W - MARGIN * 2) / img.width,
    (A4_H - MARGIN * 2) / img.height,
    1 // never upscale a small photo into a blurry full page
  );
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: (A4_W - w) / 2, y: (A4_H - h) / 2, width: w, height: h });
}

/**
 * Build the combined packet PDF.
 * @param {Object} opts
 * @param {Buffer|null} opts.jobCardPdf  rendered job-card PDF (placed first)
 * @param {Array<{name: string, ext: string, bytes: Buffer}>} opts.files
 * @returns {Promise<{ pdf: Buffer, skipped: Array<{name: string, reason: string}> }>}
 */
async function buildPacketPdf({ jobCardPdf, files }) {
  const out = await PDFDocument.create();
  const skipped = [];

  if (jobCardPdf) {
    try {
      await appendPdf(out, jobCardPdf);
    } catch (err) {
      logger.error({ err }, 'Packet: job card PDF failed to merge');
      skipped.push({ name: 'Job Card', reason: 'render' });
    }
  }

  for (const f of files) {
    try {
      if (f.ext === PDF_EXT) {
        await appendPdf(out, f.bytes);
      } else if (IMAGE_EXTS.has(f.ext)) {
        await appendImage(out, f.bytes);
      } else {
        skipped.push({ name: f.name, reason: 'unsupported' });
      }
    } catch (err) {
      logger.error({ err, file: f.name }, 'Packet: file failed, skipping');
      skipped.push({ name: f.name, reason: 'corrupt' });
    }
  }

  if (out.getPageCount() === 0) {
    throw new Error('Packet has no usable pages');
  }

  const bytes = await out.save();
  return { pdf: Buffer.from(bytes), skipped };
}

module.exports = { buildPacketPdf };
