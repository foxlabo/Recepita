import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

export async function saveBuffer(buf: Buffer, ext = '.bin') {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext.startsWith('.') ? ext : '.' + ext}`;
  const filePath = path.join(ROOT, name);
  return { filePath, url: filePath };
}
