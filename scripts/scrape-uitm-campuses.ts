/**
 * Adds UiTM (Universiti Teknologi MARA) branch campus records. UiTM
 * officially operates 34 campuses nationwide (1 main + 33 branch campuses,
 * one per state except the Federal Territories) -- only Shah Alam (main)
 * and a Puncak Alam stub existed in data/campus/ before this script, and
 * the Puncak Alam record had Shah Alam's address/coordinates copied into
 * it by mistake.
 *
 * Candidate list cross-referenced from UiTM's own branch subdomain pages
 * and both the English and Malay Wikipedia articles on UiTM (agreeing on
 * a total of 34). Two Wikipedia-listed Selangor entries were excluded as
 * non-standalone: "Seksyen 17 / INTEC" (a pre-university prep centre
 * inside Shah Alam, not a separate campus) and "Jalan Othman, Petaling
 * Jaya" (UiTM's original 1957 site, long since absorbed into Shah
 * Alam/Puncak Alam).
 *
 * Usage: npx tsx scripts/scrape-uitm-campuses.ts [--dry-run] [--id=<campus-id>]
 *
 * Geocodes every candidate via OpenStreetMap's Nominatim -- same source and
 * same three-tier fallback strategy as scripts/regeocode-osm.ts (never
 * Google Places; see the README's "A note on data accuracy" section for
 * why). A candidate is only written to data/campus/<id>.json if a tier
 * returns a city, a postcode, and a state that matches the expected state
 * -- anything less confident is skipped and logged to
 * scripts/output/uitm-campuses-review.json for manual follow-up instead of
 * being guessed at.
 *
 * Respects Nominatim's usage policy: max 1 request/second, a descriptive
 * User-Agent, no parallel requests.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MALAYSIAN_STATES, type MalaysianState } from '../src/schemas/common.schema.js';
import { campusSchema } from '../src/schemas/campus.schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPUS_DIR = path.join(ROOT, 'data', 'campus');
const OUT_DIR = path.join(ROOT, 'scripts', 'output');

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'myuni-api-uitm-scrape/1.0 (+https://github.com/haz1qq/myuni-api)';
const MIN_INTERVAL_MS = 1100; // stay comfortably under Nominatim's 1 req/sec limit
const UNIVERSITY_NAME = 'Universiti Teknologi MARA';

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

const ISO_STATE_CODES: Record<string, string> = {
  'MY-14': 'W.P. Kuala Lumpur',
  'MY-15': 'W.P. Labuan',
  'MY-16': 'W.P. Putrajaya',
};

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
  const isoCode = addr['ISO3166-2-lvl4'];
  const rawState = addr.state ?? (isoCode ? ISO_STATE_CODES[isoCode] : undefined) ?? null;

  return {
    address: top.display_name,
    city,
    postcode: addr.postcode ?? null,
    state: rawState ? normalizeState(rawState) : null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
  };
}

interface Candidate {
  id: string;
  name: string;
  state: MalaysianState;
  /** Real-world place name(s) to geocode against -- distinct from the
      official campus `name` since Nominatim knows towns/suburbs, not
      internal branch naming. */
  place: string;
}

// Cross-referenced from UiTM's branch subdomain pages + en/ms Wikipedia.
// uitm-shah-alam already exists and is correct; uitm-puncak-alam exists
// but has bugged data (copy of Shah Alam's) and gets overwritten here.
const CANDIDATES: Candidate[] = [
  { id: 'uitm-puncak-alam', name: 'Puncak Alam Campus', state: 'Selangor', place: 'Puncak Alam' },
  { id: 'uitm-puncak-perdana', name: 'Puncak Perdana Campus', state: 'Selangor', place: 'Puncak Perdana, Shah Alam' },
  { id: 'uitm-dengkil', name: 'Dengkil Campus', state: 'Selangor', place: 'Dengkil' },
  { id: 'uitm-selayang', name: 'Selayang Campus', state: 'Selangor', place: 'Selayang, Batu Caves' },
  { id: 'uitm-sungai-buloh', name: 'Sungai Buloh Campus', state: 'Selangor', place: 'Sungai Buloh' },
  { id: 'uitm-seri-iskandar', name: 'Seri Iskandar Campus', state: 'Perak', place: 'Seri Iskandar' },
  { id: 'uitm-tapah', name: 'Tapah Campus', state: 'Perak', place: 'Tapah' },
  { id: 'uitm-teluk-intan', name: 'Teluk Intan Campus', state: 'Perak', place: 'Teluk Intan' },
  { id: 'uitm-alor-gajah', name: 'Alor Gajah Campus', state: 'Melaka', place: 'Alor Gajah' },
  { id: 'uitm-bandaraya-melaka', name: 'Bandaraya Melaka Campus', state: 'Melaka', place: 'Melaka' },
  { id: 'uitm-jasin', name: 'Jasin Campus', state: 'Melaka', place: 'Jasin' },
  { id: 'uitm-kuala-pilah', name: 'Kuala Pilah Campus', state: 'Negeri Sembilan', place: 'Kuala Pilah' },
  { id: 'uitm-seremban-3', name: 'Seremban 3 Campus', state: 'Negeri Sembilan', place: 'Seremban 3, Seremban' },
  { id: 'uitm-rembau', name: 'Rembau Campus', state: 'Negeri Sembilan', place: 'Rembau' },
  { id: 'uitm-segamat', name: 'Segamat Campus', state: 'Johor', place: 'Segamat' },
  { id: 'uitm-pasir-gudang', name: 'Pasir Gudang Campus', state: 'Johor', place: 'Masai, Pasir Gudang' },
  { id: 'uitm-jengka', name: 'Jengka Campus', state: 'Pahang', place: 'Jengka' },
  { id: 'uitm-raub', name: 'Raub Campus', state: 'Pahang', place: 'Raub' },
  { id: 'uitm-kuantan', name: 'Kuantan Campus', state: 'Pahang', place: 'Kuantan' },
  { id: 'uitm-dungun', name: 'Dungun Campus', state: 'Terengganu', place: 'Dungun' },
  { id: 'uitm-kuala-terengganu', name: 'Kuala Terengganu Campus', state: 'Terengganu', place: 'Chendering, Kuala Terengganu' },
  { id: 'uitm-bukit-besi', name: 'Bukit Besi Campus', state: 'Terengganu', place: 'Bukit Besi' },
  { id: 'uitm-machang', name: 'Machang Campus', state: 'Kelantan', place: 'Machang' },
  { id: 'uitm-kota-bharu', name: 'Kota Bharu Campus', state: 'Kelantan', place: 'Kota Bharu' },
  { id: 'uitm-permatang-pauh', name: 'Permatang Pauh Campus', state: 'Pulau Pinang', place: 'Permatang Pauh' },
  { id: 'uitm-bertam', name: 'Bertam Campus', state: 'Pulau Pinang', place: 'Bertam, Kepala Batas' },
  { id: 'uitm-arau', name: 'Arau Campus', state: 'Perlis', place: 'Arau' },
  { id: 'uitm-sungai-petani', name: 'Sungai Petani Campus', state: 'Kedah', place: 'Merbok, Sungai Petani' },
  { id: 'uitm-samarahan', name: 'Samarahan Campus', state: 'Sarawak', place: 'Kota Samarahan' },
  { id: 'uitm-samarahan-2', name: 'Samarahan 2 Campus', state: 'Sarawak', place: 'Kota Samarahan' },
  { id: 'uitm-mukah', name: 'Mukah Campus', state: 'Sarawak', place: 'Mukah' },
  { id: 'uitm-kota-kinabalu', name: 'Kota Kinabalu Campus', state: 'Sabah', place: 'Kuala Menggatal, Kota Kinabalu' },
  { id: 'uitm-tawau', name: 'Tawau Campus', state: 'Sabah', place: 'Tawau' },
];

interface QueryAttempt {
  tier: string;
  query: string;
  reason: string;
}

interface ReviewEntry {
  campusId: string;
  attempts: QueryAttempt[];
}

function buildQueryTiers(candidate: Candidate): Array<{ tier: string; query: string }> {
  return [
    { tier: 'full-name', query: `${UNIVERSITY_NAME} ${candidate.name}, ${candidate.state}, Malaysia` },
    { tier: 'uitm-short', query: `UiTM ${candidate.place}, ${candidate.state}, Malaysia` },
    { tier: 'place-only', query: `${candidate.place}, ${candidate.state}, Malaysia` },
  ];
}

async function resolveCandidate(
  candidate: Candidate,
): Promise<{ resolved: { result: GeocodeResult; tier: string } | null; attempts: QueryAttempt[] }> {
  const attempts: QueryAttempt[] = [];

  for (const { tier, query } of buildQueryTiers(candidate)) {
    const result = await geocode(query);
    await sleep(MIN_INTERVAL_MS);

    if (!result) {
      attempts.push({ tier, query, reason: 'no Nominatim match' });
      continue;
    }
    if (!result.city || !result.postcode) {
      attempts.push({
        tier,
        query,
        reason: `missing city/postcode in result: ${JSON.stringify(result)}`,
      });
      continue;
    }
    if (result.state !== candidate.state) {
      attempts.push({
        tier,
        query,
        reason: `expected state "${candidate.state}" vs Nominatim state "${result.state}"`,
      });
      continue;
    }

    return { resolved: { result, tier }, attempts };
  }
  return { resolved: null, attempts };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const idArg = args.find((a) => a.startsWith('--id='));
  const onlyId = idArg ? idArg.split('=')[1] : null;

  const review: ReviewEntry[] = [];
  let written = 0;
  let processed = 0;

  for (const candidate of CANDIDATES) {
    if (onlyId && candidate.id !== onlyId) continue;
    processed++;

    const { resolved, attempts } = await resolveCandidate(candidate);

    if (!resolved) {
      console.log(`[no match]    ${candidate.id} (tried ${attempts.length} queries)`);
      review.push({ campusId: candidate.id, attempts });
      continue;
    }

    const { result, tier } = resolved;
    const campus = {
      id: candidate.id,
      university_id: 'uitm',
      name: candidate.name,
      state: candidate.state,
      city: result.city,
      postcode: result.postcode,
      address: result.address,
      latitude: result.latitude,
      longitude: result.longitude,
    };

    const check = campusSchema.safeParse(campus);
    if (!check.success) {
      console.log(`[invalid]     ${candidate.id}`);
      review.push({
        campusId: candidate.id,
        attempts: [
          ...attempts,
          {
            tier,
            query: '(post-validation)',
            reason: `schema validation failed: ${check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
          },
        ],
      });
      continue;
    }

    const campusPath = path.join(CAMPUS_DIR, `${candidate.id}.json`);
    if (!dryRun) {
      fs.writeFileSync(campusPath, JSON.stringify(check.data, null, 2) + '\n');
    }
    console.log(`[written:${tier}] ${candidate.id}`);
    written++;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const reviewPath = path.join(OUT_DIR, 'uitm-campuses-review.json');
  fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');

  console.log('');
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Processed ${processed}, written ${written}, needs review: ${review.length}.`,
  );
  console.log(`Review list written to scripts/output/uitm-campuses-review.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
