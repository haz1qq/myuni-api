/**
 * Promotes reviewed Polytechnic/Community College draft records (from
 * scrape-poly-kk.ts) into data/university/ and data/campus/. Same
 * validation-gated, idempotent behavior as promote-ipts.ts: a record is only
 * written if the university AND its campus pass universitySchema/
 * campusSchema as-is, and already-promoted ids are never re-touched.
 *
 * Usage: npx tsx scripts/promote-poly-kk.ts [--category=polytechnic|community-college|all] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { universitySchema } from '../src/schemas/university.schema.js';
import { campusSchema } from '../src/schemas/campus.schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const UNIVERSITY_DIR = path.join(ROOT, 'data', 'university');
const CAMPUS_DIR = path.join(ROOT, 'data', 'campus');

const ALL_CATEGORIES = ['polytechnic', 'community-college'];

interface SkipRecord {
  id: string;
  name: string;
  reasons: string[];
}

function main(): void {
  const categoryArg = process.argv.find((a) => a.startsWith('--category='));
  const category = categoryArg ? categoryArg.split('=')[1] : 'all';
  const dryRun = process.argv.includes('--dry-run');
  const categories = category === 'all' ? ALL_CATEGORIES : [category];

  const existingIds = new Set(
    fs.readdirSync(UNIVERSITY_DIR).map((f) => path.basename(f, '.json')),
  );

  let promoted = 0;
  let alreadyPromoted = 0;
  const skipped: SkipRecord[] = [];

  for (const cat of categories) {
    const draftPath = path.join(OUT_DIR, `poly-kk-draft-${cat}.json`);
    if (!fs.existsSync(draftPath)) {
      console.log(`(no draft file for category "${cat}", skipping)`);
      continue;
    }
    const drafts = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

    for (const record of drafts) {
      const id = record.university.id;
      if (existingIds.has(id)) {
        alreadyPromoted++;
        continue;
      }

      const uResult = universitySchema.safeParse(record.university);
      const campusResults = record.campuses.map((c: unknown) => campusSchema.safeParse(c));
      const allCampusesValid = campusResults.every((r: { success: boolean }) => r.success);

      if (uResult.success && allCampusesValid) {
        if (!dryRun) {
          fs.writeFileSync(
            path.join(UNIVERSITY_DIR, `${id}.json`),
            JSON.stringify(uResult.data, null, 2) + '\n',
          );
          for (const c of record.campuses) {
            const parsedCampus = campusSchema.parse(c);
            fs.writeFileSync(
              path.join(CAMPUS_DIR, `${parsedCampus.id}.json`),
              JSON.stringify(parsedCampus, null, 2) + '\n',
            );
          }
        }
        existingIds.add(id);
        promoted++;
      } else {
        const reasons: string[] = [];
        if (!uResult.success) {
          reasons.push(
            ...uResult.error.issues.map((i) => `university.${i.path.join('.')}: ${i.message}`),
          );
        }
        campusResults.forEach(
          (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }, idx: number) => {
            if (!r.success && r.error) {
              reasons.push(
                ...r.error.issues.map((i) => `campus[${idx}].${i.path.join('.')}: ${i.message}`),
              );
            }
          },
        );
        skipped.push({ id, name: record.university.name, reasons });
      }
    }
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Promoted ${promoted} institution(s).`);
  console.log(`Skipped (already in data/): ${alreadyPromoted}`);
  console.log(`Skipped (incomplete): ${skipped.length}`);

  if (skipped.length > 0) {
    const reportPath = path.join(OUT_DIR, 'poly-kk-promote-skipped.json');
    fs.writeFileSync(reportPath, JSON.stringify(skipped, null, 2) + '\n');
    console.log(`Wrote skip reasons to ${path.relative(ROOT, reportPath)}`);
  }
}

main();
