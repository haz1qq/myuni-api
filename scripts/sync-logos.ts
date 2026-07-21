/**
 * Points each university's `logo` field at the logo file that actually exists.
 *
 * Usage: npx tsx scripts/sync-logos.ts
 *
 * Scans public/logos/ for files named <university-id>.<ext> and rewrites the
 * `logo` field in data/university/<id>.json to match the real extension
 * (preferring png > svg > webp > jpg > jpeg when several exist). Universities
 * without a logo file keep their current value. Run it after dropping new
 * logo files into public/logos/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGOS_DIR = path.join(ROOT, 'public', 'logos');
const UNIVERSITIES_DIR = path.join(ROOT, 'data', 'university');

const EXT_PREFERENCE = ['png', 'svg', 'webp', 'jpg', 'jpeg'];

const available = new Map<string, string>();
for (const file of fs.readdirSync(LOGOS_DIR)) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const id = path.basename(file, path.extname(file));
  if (!EXT_PREFERENCE.includes(ext)) continue;
  const existing = available.get(id);
  if (!existing || EXT_PREFERENCE.indexOf(ext) < EXT_PREFERENCE.indexOf(existing)) {
    available.set(id, ext);
  }
}

let updated = 0;
for (const file of fs.readdirSync(UNIVERSITIES_DIR)) {
  if (!file.endsWith('.json')) continue;
  const filePath = path.join(UNIVERSITIES_DIR, file);
  const university = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ext = available.get(university.id);
  if (!ext) continue;
  const logo = `/logos/${university.id}.${ext}`;
  if (university.logo === logo) continue;
  university.logo = logo;
  fs.writeFileSync(filePath, JSON.stringify(university, null, 2) + '\n');
  console.log(`${file}: logo -> ${logo}`);
  updated++;
}
console.log(updated === 0 ? 'All logo fields already match.' : `Updated ${updated} file(s).`);
