/**
 * Zero-dependency placeholder asset generators for the demo seed (T-D01).
 * Produces genuinely valid, minimal PDF and PNG bytes at runtime — nothing is
 * downloaded from the internet. If a real asset exists under
 * `apps/api/scripts/seed-assets/<kind>/<key>.<ext>`, callers should prefer that
 * file's bytes over these generators (see `loadAssetOrGenerate` below).
 */
import { existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// CRC32 (needed for PNG chunk checksums) — standard table-based implementation,
// dependency-free (Node has no built-in crc32 guaranteed across Node 20 patch
// versions, so this is hand-rolled rather than relying on a possibly-absent API).
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** A minimal, valid, solid-color PNG (truecolor, no interlacing). */
export function simplePng(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk('IHDR', ihdrData);

  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0; // filter type: none
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = rgb[0];
    row[1 + x * 3 + 1] = rgb[1];
    row[1 + x * 3 + 2] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = pngChunk('IDAT', deflateSync(raw));

  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * A minimal, valid, single-page PDF with a title string — real xref byte
 * offsets are computed, not guessed, so the file is spec-correct.
 */
export function minimalPdf(title: string): Buffer {
  const escaped = title.replace(/[()\\]/g, (c) => `\\${c}`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> ' +
      '/MediaBox [0 0 612 792] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    null, // stream object, built below (needs its own /Length)
  ];
  const streamContent = `BT /F1 20 Tf 72 700 Td (${escaped}) Tj ET`;
  objects[4] = `<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(out, 'latin1');
}

/** Demo asset kinds, mapped to their folder + extension under seed-assets/. */
export type AssetKind = 'logos' | 'documents' | 'animals';

const ASSET_ROOT = join(__dirname, 'seed-assets');
const EXT_BY_KIND: Record<AssetKind, string[]> = {
  logos: ['png', 'jpg', 'jpeg', 'webp'],
  documents: ['pdf'],
  animals: ['png', 'jpg', 'jpeg', 'webp'],
};
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * Look for a real demo asset at `apps/api/scripts/seed-assets/<kind>/<key>.<ext>`
 * (first matching extension wins); fall back to `generate()` if none exists.
 * Returns the bytes, the filename to use, and its content type.
 */
export function loadAssetOrGenerate(
  kind: AssetKind,
  key: string,
  generate: () => { bytes: Buffer; filename: string; contentType: string },
): { bytes: Buffer; filename: string; contentType: string; usedRealAsset: boolean } {
  for (const ext of EXT_BY_KIND[kind]) {
    const path = join(ASSET_ROOT, kind, `${key}.${ext}`);
    if (existsSync(path)) {
      return {
        bytes: readFileSync(path),
        filename: `${key}.${ext}`,
        contentType: CONTENT_TYPE_BY_EXT[ext],
        usedRealAsset: true,
      };
    }
  }
  return { ...generate(), usedRealAsset: false };
}
