// lib/fileStorage.ts
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ROOT = process.env.STORAGE_LOCAL_DIR || '.storage';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function localSaveTemp(originalName: string, buffer: Buffer) {
  const id = randomUUID();
  const safeName = originalName.replace(/[^\w\-\.\u3000-\u9FFF]+/g, '_');
  const subdir = new Date().toISOString().slice(0,10).replace(/-/g,'/'); // YYYY/MM/DD
  const dir = path.join(ROOT, 'uploads', subdir);
  ensureDir(dir);
  const fileName = id + '-' + safeName;
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, buffer);
  const rel = path.relative(ROOT, full).replace(/\\/g,'/');
  return { id, relPath: rel, fullPath: full };
}

export function localRead(relPath: string) {
  const full = path.join(process.env.STORAGE_LOCAL_DIR || '.storage', relPath);
  return fs.readFileSync(full);
}

export function localFullPath(relPath: string) {
  return path.join(process.env.STORAGE_LOCAL_DIR || '.storage', relPath);
}
