import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { universitySchema, type University } from '../schemas/university.schema.js';
import { campusSchema, type Campus } from '../schemas/campus.schema.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UNIVERSITIES_DIR = path.join(DATA_DIR, 'university');
const CAMPUSES_DIR = path.join(DATA_DIR, 'campus');

export class DataIntegrityError extends Error {
  constructor(problems: string[]) {
    super(`Data integrity check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'DataIntegrityError';
  }
}

function loadJsonDirectory<T extends { id: string }>(
  dirPath: string,
  schema: z.ZodType<T>,
): T[] {
  if (!fs.existsSync(dirPath)) {
    throw new DataIntegrityError([`Data directory not found: ${dirPath}`]);
  }

  const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.json'));
  const records: T[] = [];
  const problems: string[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const raw = fs.readFileSync(filePath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      problems.push(`${file}: invalid JSON (${(err as Error).message})`);
      continue;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      problems.push(`${file}: ${issues}`);
      continue;
    }

    if (seenIds.has(result.data.id)) {
      problems.push(`${file}: duplicate id "${result.data.id}"`);
      continue;
    }

    seenIds.add(result.data.id);
    records.push(result.data);
  }

  if (problems.length > 0) {
    throw new DataIntegrityError(problems);
  }

  return records;
}

export interface LoadedData {
  universities: University[];
  campuses: Campus[];
}

let cache: LoadedData | undefined;

export function loadData(forceReload = false): LoadedData {
  if (cache && !forceReload) {
    return cache;
  }

  const universities = loadJsonDirectory(UNIVERSITIES_DIR, universitySchema);
  const campuses = loadJsonDirectory(CAMPUSES_DIR, campusSchema);

  const universityIds = new Set(universities.map((u) => u.id));
  const problems: string[] = [];
  for (const campus of campuses) {
    if (!universityIds.has(campus.university_id)) {
      problems.push(
        `campuses/${campus.id}.json: references unknown university_id "${campus.university_id}"`,
      );
    }
  }
  if (problems.length > 0) {
    throw new DataIntegrityError(problems);
  }

  cache = { universities, campuses };
  return cache;
}
