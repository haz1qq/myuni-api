# Contributing to myuni-api

Thanks for helping build an open, accurate directory of Malaysian universities and campuses.
Most contributions here are **data**, not code — adding a missing institution, fixing a wrong
address, filling in a `null` field. You don't need an API key or any special access to do any of
that.

## Ways to contribute

- **Fix wrong or outdated data** — an address, phone number, coordinates, a renamed campus.
- **Fill in missing fields** — many records have `established`, `student_range`, or `website` set
  to `null` because it wasn't found automatically. A quick check of the university's own website
  is enough to fix one.
- **Add a missing institution** — a university, university college, or campus that isn't in the
  dataset yet. In particular, the `Polytechnic` and `Community College` categories are defined in
  the schema but have no entries yet — public polytechnics and community colleges are welcome
  additions.
- **Add a logo** — drop an image into `public/logos/`, see [Adding a logo](#adding-a-logo) below.
- **Improve the code** — the API server, the landing page, or the test suite.

If you're not sure whether something belongs, open an issue first and ask.

## Data contributions

### 1. Understand the shape

Each university is one file, `data/university/<id>.json`:

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

| Field           | Required | Notes                                                                 |
| --------------- | -------- | ---------------------------------------------------------------------- |
| `id`            | yes      | lowercase kebab-case, must be unique (e.g. `uitm`, `taylors-university`) |
| `name`          | yes      | full official name                                                    |
| `short_name`    | yes      | common abbreviation, e.g. `UiTM`                                       |
| `category`      | yes      | one of `IPTA`, `IPTS`, `Polytechnic`, `Community College`, `MARA College` |
| `website`       | no       | full URL, or `null` if unknown                                        |
| `established`   | no       | founding year, or `null` if unknown — don't guess                     |
| `student_range` | no       | e.g. `"170000+"`, or `null` if unknown — don't guess                  |
| `logo`          | no       | set automatically by `npx tsx scripts/sync-logos.ts`, don't hand-edit |
| `description`   | no       | short free-text description                                           |

Each campus is one file, `data/campus/<id>.json`, and points back at its university:

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

| Field           | Required | Notes                                                                 |
| --------------- | -------- | ---------------------------------------------------------------------- |
| `id`            | yes      | lowercase kebab-case, unique, conventionally `<university_id>-<campus>` |
| `university_id` | yes      | must match an existing `data/university/<id>.json`                    |
| `name`          | yes      | e.g. `"Main Campus"`, `"Shah Alam Campus"`                             |
| `state`         | yes      | one of the 13 states or `W.P. Kuala Lumpur` / `W.P. Labuan` / `W.P. Putrajaya` (see `src/schemas/common.schema.ts`) |
| `city`          | yes      |                                                                        |
| `postcode`      | yes      | 5 digits                                                               |
| `address`       | yes      | full postal address                                                    |
| `latitude`      | yes      | decimal degrees                                                        |
| `longitude`     | yes      | decimal degrees                                                        |
| `phone`         | no       |                                                                        |
| `email`         | no       |                                                                        |

Full definitions with exact validation rules live in `src/schemas/university.schema.ts` and
`src/schemas/campus.schema.ts` — the tables above summarize them, but the schema is the source of
truth if they ever disagree.

### 2. Don't guess

If you can't find a value from a reliable source (the institution's own site, MQA, MOHE), leave
it `null` rather than estimating. A missing field is honest; a wrong number is worse than missing.

### 3. Validate before opening a PR

```bash
npm install
npm run validate
```

This runs the exact same check the server runs on boot: every file parses as valid JSON, matches
its schema, has no duplicate `id`, and every campus's `university_id` points at a real
university. It needs no API key and no network access. Fix whatever it reports and re-run until
you see:

```
✔ Data OK — 450 universities, 502 campuses, all valid.
```

Then run the test suite too:

```bash
npm test
```

### Adding a logo

Drop the image into `public/logos/` named after the university's `id` (any of `.png`, `.svg`,
`.webp`, `.jpg` works), then run:

```bash
npx tsx scripts/sync-logos.ts
```

This writes the correct `logo` path into the matching `data/university/<id>.json` for you — don't
set that field by hand.

## Code contributions

Standard flow: fork, branch, make your change, and make sure these all pass before opening a PR:

```bash
npm run typecheck
npm run lint
npm test
```

If you're touching data loading or the schemas, also run `npm run validate`.

## What not to touch

A few scripts under `scripts/` (`scrape-ipts.ts`, `enrich-established-student-range.ts`) are
maintainer-only tooling used to originally seed the IPTS dataset — they call paid external APIs
(Google Places, Anthropic) and require API keys you won't have. You don't need them for a data
contribution; editing or adding a JSON file directly and running `npm run validate` is the whole
workflow.

## Questions

Open an issue if you're unsure about anything — a wrong-looking record, a category that doesn't
fit, or a bug. PRs that fix a small, obvious thing don't need an issue first.
