// lib/ocr/sniff.ts
// Server-side file type detection for OCR uploads (moved from app/api/ocr/route.ts).

export type DetectedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heif' | 'application/pdf';

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif']);

/** Identify the file by its magic bytes; the declared type is not trusted. */
export function sniffType(buf: Buffer): DetectedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(buf.toString('latin1', 8, 12))) {
    return 'image/heif';
  }
  // PDF header must appear within the first 1024 bytes.
  if (buf.subarray(0, 1024).includes('%PDF-', 0, 'latin1')) return 'application/pdf';
  return null;
}
