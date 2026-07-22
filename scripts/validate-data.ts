/**
 * Validates every file in data/university/ and data/campus/ against the Zod
 * schemas, plus cross-file checks (duplicate ids, campus -> university_id
 * references). This is the exact same check the server runs on boot
 * (src/services/data-loader.service.ts) - run it before opening a PR so you
 * don't have to wait for CI to find a typo.
 *
 * No API key required. Usage: npm run validate
 */
import { loadData, DataIntegrityError } from '../src/services/data-loader.service.js';

try {
  const { universities, campuses } = loadData(true);
  console.log(
    `✔ Data OK — ${universities.length} universities, ${campuses.length} campuses, all valid.`,
  );
} catch (err) {
  if (err instanceof DataIntegrityError) {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
