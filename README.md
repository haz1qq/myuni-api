# myuni-api

An open-source REST API for Malaysian higher-education data — public universities (IPTA), private
universities and colleges (IPTS), polytechnics, community colleges, and MARA colleges — along with
their campuses. Includes a searchable, map-based landing page.

## Tech stack

- **Runtime:** Node.js (LTS)
- **Framework:** Express.js
- **Language:** TypeScript
- **Data source:** JSON files (`data/university/*.json`, `data/campus/*.json`)
- **Validation:** Zod
- **API docs:** Swagger / OpenAPI
- **Testing:** Vitest + Supertest
- **License:** MIT

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The API runs at `http://localhost:3000` — a searchable landing page with a state-by-state map is
served at `/`, and interactive API docs (Swagger) at `/docs`.

## Scripts

| Script              | Description                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`         | Start the dev server with hot reload      |
| `npm run build`       | Compile TypeScript to `dist/`             |
| `npm start`           | Run the compiled server                   |
| `npm test`            | Run the test suite once                   |
| `npm run test:watch`  | Run tests in watch mode                   |
| `npm run lint`        | Lint the codebase                         |
| `npm run typecheck`   | Type-check without emitting               |
| `npm run validate`    | Validate `data/` against the schemas (same check the server runs on boot) |

## API

Base path: `/api`

| Method | Path                     | Description                                     |
| ------ | ------------------------ | ------------------------------------------------ |
| GET    | `/university`            | List universities. Filters: `category` (`IPTA`\|`IPTS`\|`Polytechnic`\|`Community College`\|`MARA College`), `state` (matches universities with at least one campus there), `search`. Paginated: `page`, `limit`. |
| GET    | `/university/:id`        | Get one university, with its campuses embedded.   |
| GET    | `/campus`                | List campuses. Filters: `state`, `university_id`. Paginated: `page`, `limit`. |
| GET    | `/campus/:id`            | Get one campus.                                   |
| GET    | `/health`                | Health check.                                     |

Full interactive documentation (OpenAPI/Swagger) is served at `/docs`.

Every path also accepts an optional trailing `.json`, e.g. `/api/university.json` or
`/api/campus/uitm-shah-alam.json` — purely cosmetic, it returns the exact same response as the
plain path (including query params like `?category=IPTA`). Unlike a static file host, this is
still the live, filterable API — the `.json` suffix is just a readability convenience.

## Usage

The API is public, unauthenticated, and CORS-enabled — call it directly from a browser, mobile
app, bot, or backend of your own. No API key required.

```bash
# List universities, optionally filtered
curl "https://www.myuni-api.my/api/university?category=IPTA"

# Filters can be combined -- e.g. IPTA universities with a campus in Kedah
curl "https://www.myuni-api.my/api/university?category=IPTA&state=Kedah"

# Get one university (its campuses come embedded in the response)
curl "https://www.myuni-api.my/api/university/uum"

# List campuses, optionally filtered
curl "https://www.myuni-api.my/api/campus?university_id=uum&state=Kedah"

# Get one campus
curl "https://www.myuni-api.my/api/campus/uum-sintok"
```

From JavaScript:

```js
const res = await fetch('https://www.myuni-api.my/api/university?category=IPTA');
const { data } = await res.json();
```

Full endpoint reference, query parameters, and response schemas are in the interactive docs at
`/docs`.

## Data model

Each university lives in its own file under `data/university/<id>.json`:

```json
{
  "id": "uitm",
  "name": "Universiti Teknologi MARA",
  "short_name": "UiTM",
  "category": "IPTA",
  "website": "https://www.uitm.edu.my",
  "established": 1956,
  "student_range": "170000+"
}
```

`website`, `established`, and `student_range` are nullable — set to `null` rather than guessed
when the value isn't known.

Each campus lives in its own file under `data/campus/<id>.json`, and references its parent
university by `university_id`:

```json
{
  "id": "uitm-shah-alam",
  "university_id": "uitm",
  "name": "Shah Alam Campus",
  "state": "Selangor",
  "city": "Shah Alam",
  "postcode": "40450",
  "address": "Universiti Teknologi MARA, 40450 Shah Alam, Selangor",
  "latitude": 3.0738,
  "longitude": 101.4998
}
```

Both are validated against Zod schemas (`src/schemas/university.schema.ts`,
`src/schemas/campus.schema.ts`) on server startup — the server refuses to start if any file is
malformed, has a duplicate `id`, or a campus references a `university_id` that doesn't exist.

### A note on data accuracy

The private-institution list is seeded from MQA's Malaysian Qualifications Register (MQR), the
government registry of accredited providers, cross-checked against official university websites
and the Ministry of Higher Education (KPT). Fields like `established` and `student_range` were
filled in with AI-assisted web lookups where a reliable public source existed — where nothing
reliable turned up, the field was left `null` rather than guessed (see
[Data model](#data-model) above).

Addresses and coordinates are being migrated to OpenStreetMap data for licensing reasons — some
campuses have already moved over, and the rest still carry their originally-geocoded values
pending further migration.

None of this is guaranteed to be complete or 100% accurate. Universities restructure campuses,
rename faculties, and update figures like student counts more often than any volunteer-maintained
dataset can track. If you spot something wrong or outdated, corrections via pull request are very
welcome — see below.

## Contributing

Most contributions are data fixes — a missing field, a wrong address, a new institution — and
don't require writing any code or holding an API key. See [CONTRIBUTING.md](./CONTRIBUTING.md)
for the full guide, including the field reference and the `npm run validate` script that checks
your changes before you open a PR.

## License

[MIT](./LICENSE)
