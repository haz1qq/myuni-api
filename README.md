# myuni-api

An open-source REST API for Malaysian university data — public (IPTA) and private (IPTS)
institutions, and their campuses.

## Tech stack

- **Runtime:** Node.js (LTS)
- **Framework:** Express.js
- **Language:** TypeScript
- **Data source:** JSON files (`data/universities/*.json`, `data/campuses/*.json`)
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

The API runs at `http://localhost:3000`, interactive docs at `http://localhost:3000/docs`.

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

## API

Base path: `/api`

| Method | Path                     | Description                                     |
| ------ | ------------------------ | ------------------------------------------------ |
| GET    | `/universities`          | List universities. Filters: `category` (`IPTA`\|`IPTS`), `search`. Paginated: `page`, `limit`. |
| GET    | `/universities/:id`      | Get one university, with its campuses embedded.   |
| GET    | `/campuses`              | List campuses. Filters: `state`, `university_id`. Paginated: `page`, `limit`. |
| GET    | `/campuses/:id`          | Get one campus.                                   |
| GET    | `/health`                | Health check.                                     |

Full interactive documentation (OpenAPI/Swagger) is served at `/docs`.

Every path also accepts an optional trailing `.json`, e.g. `/api/universities.json` or
`/api/campuses/uitm-shah-alam.json` — purely cosmetic, it returns the exact same response as the
plain path (including query params like `?category=IPTA`). Unlike a static file host, this is
still the live, filterable API — the `.json` suffix is just a readability convenience.

## Usage

The API is public, unauthenticated, and CORS-enabled — call it directly from a browser, mobile
app, bot, or backend of your own. No API key required.

```bash
# List universities, optionally filtered
curl "https://your-domain.vercel.app/api/universities?category=IPTA"

# Get one university (its campuses come embedded in the response)
curl "https://your-domain.vercel.app/api/universities/uum"

# List campuses, optionally filtered
curl "https://your-domain.vercel.app/api/campuses?university_id=uum&state=Kedah"

# Get one campus
curl "https://your-domain.vercel.app/api/campuses/uum-sintok"
```

From JavaScript:

```js
const res = await fetch('https://your-domain.vercel.app/api/universities?category=IPTA');
const { data } = await res.json();
```

Full endpoint reference, query parameters, and response schemas are in the interactive docs at
`/docs`.

## Data model

Each university lives in its own file under `data/universities/<id>.json`:

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

Each campus lives in its own file under `data/campuses/<id>.json`, and references its parent
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

## Contributing data

1. Add a new `<id>.json` file to `data/universities/` (or `data/campuses/`) following the shape
   above. `id` must be lowercase kebab-case.
2. Run `npm run dev` — the server validates your file on boot and tells you exactly what's wrong
   if anything fails.
3. Run `npm test` and open a pull request.

## License

[MIT](./LICENSE)
