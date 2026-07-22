/**
 * Re-resolves campus address/geocoding data via OpenStreetMap's Nominatim,
 * replacing values originally sourced from the Google Places API. Places'
 * terms of service restrict storing/redistributing Content beyond narrow
 * caching exceptions (place_id only) -- see the README's "A note on data
 * accuracy" section. OSM data is ODbL-licensed and safe to store and
 * redistribute with attribution, which is why this project uses it going
 * forward instead.
 *
 * Usage: npx tsx scripts/regeocode-osm.ts [--dry-run] [--limit=N] [--id=<campus-id>]
 *
 * Always run with --dry-run first and check scripts/output/regeocode-review.json
 * before doing a real run -- this overwrites live data/campus/*.json files.
 *
 * For each data/campus/<id>.json file, looks up
 * "<university name> [<campus name>], <state>, Malaysia" against Nominatim's
 * search endpoint. A match only gets written back if Nominatim returns a
 * city, a postcode, and a state that agrees with the campus's existing
 * (already-trusted) state -- anything less confident is left untouched and
 * logged to scripts/output/regeocode-review.json for manual follow-up.
 * `state` itself is never overwritten: Malaysia's states are public
 * administrative geography, not Places "Content", and the existing value is
 * already validated -- only address/city/postcode/latitude/longitude change.
 *
 * Respects Nominatim's usage policy: max 1 request/second, a descriptive
 * User-Agent, no parallel requests.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MALAYSIAN_STATES } from '../src/schemas/common.schema.js';
import { campusSchema } from '../src/schemas/campus.schema.js';
import { universitySchema } from '../src/schemas/university.schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPUS_DIR = path.join(ROOT, 'data', 'campus');
const UNIVERSITY_DIR = path.join(ROOT, 'data', 'university');
const OUT_DIR = path.join(ROOT, 'scripts', 'output');

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'myuni-api-regeocode/1.0 (+https://github.com/haz1qq/myuni-api)';
const MIN_INTERVAL_MS = 1100; // stay comfortably under Nominatim's 1 req/sec limit

// Same aliasing myuni-api already applies to MQR/Places state names -- OSM
// returns the same kinds of formal/English variants.
const STATE_ALIASES: Record<string, string> = {
  'kuala lumpur': 'W.P. Kuala Lumpur',
  'wilayah persekutuan kuala lumpur': 'W.P. Kuala Lumpur',
  putrajaya: 'W.P. Putrajaya',
  'wilayah persekutuan putrajaya': 'W.P. Putrajaya',
  labuan: 'W.P. Labuan',
  'wilayah persekutuan labuan': 'W.P. Labuan',
  penang: 'Pulau Pinang',
  'pulau pinang': 'Pulau Pinang',
  malacca: 'Melaka',
  melaka: 'Melaka',
};

function normalizeState(raw: string): string | null {
  const trimmed = raw.trim();
  if ((MALAYSIAN_STATES as readonly string[]).includes(trimmed)) return trimmed;

  const alias = STATE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const lower = trimmed.toLowerCase();
  for (const state of MALAYSIAN_STATES) {
    if (state.startsWith('W.P.')) continue;
    if (lower.startsWith(state.toLowerCase())) return state;
  }
  return null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

interface GeocodeResult {
  address: string;
  city: string | null;
  postcode: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocode(query: string): Promise<GeocodeResult | null> {
  const url =
    `${NOMINATIM_ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&addressdetails=1&countrycodes=my&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return null;

  const results = (await res.json()) as NominatimResult[];
  const top = results[0];
  if (!top) return null;

  const addr = top.address ?? {};
  const city = addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? addr.suburb ?? null;
  const rawState = addr.state ?? null;

  return {
    address: top.display_name,
    city,
    postcode: addr.postcode ?? null,
    state: rawState ? normalizeState(rawState) : null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
  };
}

interface ReviewEntry {
  campusId: string;
  query: string;
  reason: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
  const idArg = args.find((a) => a.startsWith('--id='));
  const onlyId = idArg ? idArg.split('=')[1] : null;

  const campusFiles = fs
    .readdirSync(CAMPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const universityCache = new Map<string, { name: string }>();
  function loadUniversity(id: string) {
    const cached = universityCache.get(id);
    if (cached) return cached;
    const raw = JSON.parse(fs.readFileSync(path.join(UNIVERSITY_DIR, `${id}.json`), 'utf8'));
    const parsed = universitySchema.parse(raw);
    universityCache.set(id, parsed);
    return parsed;
  }

  const review: ReviewEntry[] = [];
  let processed = 0;
  let updated = 0;

  for (const file of campusFiles) {
    if (onlyId && file !== `${onlyId}.json`) continue;
    if (processed >= limit) break;
    processed++;

    const campusPath = path.join(CAMPUS_DIR, file);
    const campus = campusSchema.parse(JSON.parse(fs.readFileSync(campusPath, 'utf8')));
    const university = loadUniversity(campus.university_id);

    const campusLabel = /main campus/i.test(campus.name) ? '' : ` ${campus.name}`;
    const query = `${university.name}${campusLabel}, ${campus.state}, Malaysia`;

    const result = await geocode(query);
    await sleep(MIN_INTERVAL_MS);

    if (!result) {
      console.log(`[no match]    ${campus.id}`);
      review.push({ campusId: campus.id, query, reason: 'no Nominatim match' });
      continue;
    }
    if (!result.city || !result.postcode) {
      console.log(`[low conf]    ${campus.id}`);
      review.push({
        campusId: campus.id,
        query,
        reason: `missing city/postcode in result: ${JSON.stringify(result)}`,
      });
      continue;
    }
    if (result.state !== campus.state) {
      console.log(`[state mismatch] ${campus.id}`);
      review.push({
        campusId: campus.id,
        query,
        reason: `existing state "${campus.state}" vs Nominatim state "${result.state}"`,
      });
      continue;
    }

    const updatedCampus = {
      ...campus,
      address: result.address,
      city: result.city,
      postcode: result.postcode,
      latitude: result.latitude,
      longitude: result.longitude,
    };

    const check = campusSchema.safeParse(updatedCampus);
    if (!check.success) {
      console.log(`[invalid]     ${campus.id}`);
      review.push({
        campusId: campus.id,
        query,
        reason: `schema validation failed after update: ${check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      });
      continue;
    }

    if (!dryRun) {
      fs.writeFileSync(campusPath, JSON.stringify(check.data, null, 2) + '\n');
    }
    console.log(`[updated]     ${campus.id}`);
    updated++;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const reviewPath = path.join(OUT_DIR, 'regeocode-review.json');
  fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');

  console.log('');
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Processed ${processed}, updated ${updated}, needs review: ${review.length}.`,
  );
  console.log(`Review list written to scripts/output/regeocode-review.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
