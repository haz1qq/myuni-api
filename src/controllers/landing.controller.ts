import type { Request, Response } from 'express';
import { findUniversities } from '../services/university.service.js';
import { findCampuses } from '../services/campus.service.js';
import type { Campus } from '../schemas/campus.schema.js';
import { MALAYSIAN_STATES, type MalaysianState } from '../schemas/common.schema.js';
import { MAP_VIEWBOX, STATE_PATHS, projectToMap } from '../utils/malaysia-map.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Fixed display order; only categories actually present in the data get a
// filter button/color, so this stays correct as new categories (e.g.
// Polytechnic, Community College) get real data in a future scrape.
const CATEGORY_ORDER = ['IPTA', 'IPTS', 'Polytechnic', 'Community College', 'MARA College'];

// The API's `state` field keeps the existing "W.P. X" enum values (no
// breaking change to /api/campus?state=... or the data files) -- this is a
// display-only label used in the landing page UI so Federal Territories read
// correctly instead of being lumped in as if they were ordinary states.
function stateLabel(state: MalaysianState): string {
  switch (state) {
    case 'W.P. Kuala Lumpur':
      return 'Federal Territory of Kuala Lumpur';
    case 'W.P. Labuan':
      return 'Federal Territory of Labuan';
    case 'W.P. Putrajaya':
      return 'Federal Territory of Putrajaya';
    default:
      return state;
  }
}

/** Campus-count bin: 0 = no data, 1..4 = sequential ramp steps. */
function binForCount(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

interface StateCounts {
  u: number;
  c: number;
}

export function renderLanding(req: Request, res: Response): void {
  const ogUrl = `https://${req.get('host')}/`;
  const universities = findUniversities({});
  const campuses = findCampuses({});

  const campusesByState = new Map<MalaysianState, Campus[]>();
  for (const campus of campuses) {
    const list = campusesByState.get(campus.state) ?? [];
    list.push(campus);
    campusesByState.set(campus.state, list);
  }

  const stateCounts = {} as Record<MalaysianState, StateCounts>;
  const stateLabels = {} as Record<MalaysianState, string>;
  for (const state of MALAYSIAN_STATES) {
    const stateCampuses = campusesByState.get(state) ?? [];
    const uniIds = new Set(stateCampuses.map((c) => c.university_id));
    stateCounts[state] = { u: uniIds.size, c: stateCampuses.length };
    stateLabels[state] = stateLabel(state);
  }

  const statesByUniversity = new Map<string, Set<MalaysianState>>();
  const campusesByUniversity = new Map<string, Campus[]>();
  for (const campus of campuses) {
    const set = statesByUniversity.get(campus.university_id) ?? new Set<MalaysianState>();
    set.add(campus.state);
    statesByUniversity.set(campus.university_id, set);
    const list = campusesByUniversity.get(campus.university_id) ?? [];
    list.push(campus);
    campusesByUniversity.set(campus.university_id, list);
  }
  const directory = universities
    .slice()
    .sort((a, b) => a.short_name.localeCompare(b.short_name))
    .map((u) => ({
      id: u.id,
      short: u.short_name,
      name: u.name,
      cat: u.category,
      logo: u.logo,
      states: [...(statesByUniversity.get(u.id) ?? [])],
      c: (campusesByUniversity.get(u.id) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state })),
    }));

  const presentCategories = CATEGORY_ORDER.filter((cat) => directory.some((u) => u.cat === cat));

  // IPTA and IPTS are both conventionally "universities" in everyday usage;
  // Polytechnic/Community College/MARA College are distinct TVET institution
  // types. All four live inside one breakdown card rather than one top-level
  // card each; a row only appears once its category actually has data, same
  // rule as presentCategories above.
  const categoryCounts: Record<string, number> = {};
  for (const u of directory) {
    categoryCounts[u.cat] = (categoryCounts[u.cat] ?? 0) + 1;
  }
  const universityCount = (categoryCounts.IPTA ?? 0) + (categoryCounts.IPTS ?? 0);

  // Campuses joins the same row as a trailing, visually-separated entry
  // (divider: true) rather than a category -- it's not one, but it belongs
  // in this card, not floating alone in its own tile.
  const breakdown: { label: string; value: number; divider?: boolean }[] = [
    { label: 'Universities', value: universityCount },
    ...(categoryCounts.Polytechnic ? [{ label: 'Polytechnics', value: categoryCounts.Polytechnic }] : []),
    ...(categoryCounts['Community College']
      ? [{ label: 'Community Colleges', value: categoryCounts['Community College'] }]
      : []),
    ...(categoryCounts['MARA College']
      ? [{ label: 'MARA Colleges', value: categoryCounts['MARA College'] }]
      : []),
    { label: 'Campuses', value: campuses.length, divider: true },
  ];

  const statePathsMarkup = MALAYSIAN_STATES.map((state) => {
    const counts = stateCounts[state];
    const bin = binForCount(counts.c);
    const label = `${stateLabels[state]}: ${counts.u} universit${counts.u === 1 ? 'y' : 'ies'}, ${counts.c} campus${counts.c === 1 ? '' : 'es'}`;
    return `<path class="state" data-state="${escapeHtml(state)}" data-bin="${bin}" d="${STATE_PATHS[state]}" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="${escapeHtml(label)}" />`;
  }).join('\n        ');

  const campusDots = campuses
    .map((campus) => {
      const { x, y } = projectToMap(campus.longitude, campus.latitude);
      return `<circle class="campus-dot" data-state="${escapeHtml(campus.state)}" data-university="${escapeHtml(campus.university_id)}" cx="${x}" cy="${y}" r="3.5" vector-effect="non-scaling-stroke" />`;
    })
    .join('\n        ');

  const payloadJson = JSON.stringify({ stateCounts, stateLabels, unis: directory }).replace(
    /</g,
    '\\u003c',
  );

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta
    name="description"
    content="Open-source REST API for Malaysian higher-education data — ${universities.length} universities and ${campuses.length} campuses across IPTA, IPTS, polytechnics, community colleges and MARA colleges, mapped state by state."
  />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="myuni-api" />
  <meta property="og:title" content="myuni-api — Malaysian University & Campus Data API" />
  <meta
    property="og:description"
    content="Search ${universities.length} Malaysian universities and ${campuses.length} campuses — IPTA, IPTS, polytechnics, community colleges and more, mapped state by state."
  />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:image" content="${ogUrl}og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="myuni-api — Malaysian University & Campus Data API" />
  <meta
    name="twitter:description"
    content="Search Malaysian universities and campuses on an interactive map."
  />
  <title>myuni-api</title>
  <link rel="stylesheet" href="/landing.css" />
</head>
<body>
  <main>
    <header>
      <h1>myuni-api</h1>
      <p class="subtitle">Open-source REST API for Malaysian university and campus data (public &amp; private institutions). Search below, or browse the map by location.</p>
      <p class="contribute-note">Interested in contributing? <a href="https://github.com/haz1qq/myuni-api" target="_blank" rel="noopener noreferrer">Click here</a>.</p>
      <p class="links">
        <a class="primary" href="/docs">API docs</a>
        <a href="/health">Health check</a>
        <a href="/api/university"><code>/api/university</code></a>
        <a href="/api/campus"><code>/api/campus</code></a>
        <a class="icon-link" href="https://github.com/haz1qq/myuni-api" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          GitHub
        </a>
      </p>
      <div class="stats">
        <div class="stat stat-breakdown">
          <h2>By category</h2>
          <ul class="breakdown-list">
            ${breakdown
              .map(
                (b) => `<li${b.divider ? ' class="divider"' : ''}>
              <span class="breakdown-label">${escapeHtml(b.label)}</span>
              <span class="breakdown-value" data-count="${b.value}">0</span>
            </li>`,
              )
              .join('\n            ')}
          </ul>
        </div>
      </div>
    </header>

    <section class="panel search-hero">
      <h2>Find a university</h2>
      <p class="panel-sub">Search by name, filter by category or state, or click a state on the map below.</p>
      <div class="search-row">
        <input id="uni-search" type="search" placeholder="Search ${universities.length} universities&hellip;" aria-label="Search universities" autocomplete="off" />
        <select id="state-select" aria-label="Filter by state">
          <option value="">All states</option>
          ${MALAYSIAN_STATES.map(
            (s) => `<option value="${escapeHtml(s)}">${escapeHtml(stateLabels[s])}</option>`,
          ).join('\n          ')}
        </select>
      </div>
      <div class="uni-filter" role="group" aria-label="Filter universities by category">
        <button type="button" class="active" data-cat="ALL">All</button>
        ${presentCategories
          .map((cat) => `<button type="button" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`)
          .join('\n        ')}
      </div>
      <div class="search-meta">
        <span id="uni-count"></span>
        <span id="state-filter-pill" hidden><span id="state-filter-name"></span><button type="button" id="state-filter-clear" aria-label="Clear state filter">&times;</button></span>
      </div>
    </section>

    <section class="panel" id="results-card">
      <div class="uni-list" id="uni-list" aria-label="Universities"></div>
      <p class="empty-note" id="uni-empty" hidden>No universities match your search.</p>
      <div class="pagination" id="pagination">
        <button type="button" id="page-prev">&lsaquo; Prev</button>
        <span id="page-indicator"></span>
        <button type="button" id="page-next">Next &rsaquo;</button>
      </div>
    </section>

    <div class="detail-drawer" id="detail-drawer">
      <div class="detail-drawer-inner">
        <div class="two-col">
          <div class="panel" id="detail-card">
            <h3 id="detail-title"></h3>
            <p id="detail-meta"></p>
            <ul class="campus-list" id="detail-campuses"></ul>
            <p class="empty-note" id="detail-empty">Click a university above to see its campuses here.</p>
          </div>
          <div class="panel">
            <div class="tester-bar">
              <code id="endpoint">GET /api/university</code>
              <button id="run-btn" type="button">Run</button>
            </div>
            <div class="quick-links">
              <button type="button" data-url="/api/university">All universities</button>
              <button type="button" data-url="/api/campus">All campuses</button>
            </div>
            <div class="snippet-box">
              <div class="snippet-tabs" role="tablist" aria-label="Copy the current endpoint as">
                <button type="button" class="active" data-lang="url">URL</button>
                <button type="button" data-lang="curl">cURL</button>
                <button type="button" data-lang="js">JavaScript</button>
                <button type="button" data-lang="py">Python</button>
                <button type="button" id="copy-btn">Copy</button>
              </div>
              <pre id="snippet"></pre>
            </div>
            <p class="response-prompt" id="response-prompt">Click &ldquo;Run&rdquo; to send the request and see the response.</p>
            <div class="response-panel" id="response-panel">
              <div class="response-panel-inner">
                <div id="tester-status" role="status"></div>
                <pre id="response" aria-live="polite"></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section class="panel map-card">
      <h2>Browse by location</h2>
      <p class="panel-sub">Hover a state to preview it, click to filter the results above &amp; zoom in. Ctrl + scroll to zoom, drag to pan.</p>
      <div class="map-wrap">
        <svg id="map-svg" class="map" viewBox="${MAP_VIEWBOX}" role="group" aria-label="Map of Malaysia. Each state is a button that filters the university list by location.">
          <defs>
            <pattern id="nodata-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" />
              <line x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          <g id="states">
        ${statePathsMarkup}
          </g>
          <g aria-hidden="true">
        ${campusDots}
          </g>
        </svg>
        <div class="map-controls">
          <button id="zoom-in" type="button" aria-label="Zoom in">+</button>
          <button id="zoom-out" type="button" aria-label="Zoom out">&minus;</button>
          <button id="zoom-reset" type="button" aria-label="Reset view">&#8634;</button>
        </div>
        <div id="zoom-hint" aria-hidden="true">Use Ctrl + scroll to zoom the map</div>
      </div>
      <div class="legend">
        <button class="key" type="button" data-bin="0" aria-label="Highlight states with no campuses"><span class="swatch hatch"></span>No campuses</button>
        <button class="key" type="button" data-bin="1" aria-label="Highlight states with 1 to 2 campuses"><span class="swatch" style="background: var(--map-1)"></span>1&ndash;2</button>
        <button class="key" type="button" data-bin="2" aria-label="Highlight states with 3 to 4 campuses"><span class="swatch" style="background: var(--map-2)"></span>3&ndash;4</button>
        <button class="key" type="button" data-bin="3" aria-label="Highlight states with 5 to 7 campuses"><span class="swatch" style="background: var(--map-3)"></span>5&ndash;7</button>
        <button class="key" type="button" data-bin="4" aria-label="Highlight states with 8 or more campuses"><span class="swatch" style="background: var(--map-4)"></span>8+</button>
        <span class="key"><span class="dot-key"></span>Campus location</span>
      </div>
      <p class="map-note">Sea gap between the Peninsula and Borneo is compressed for layout. State boundaries: DOSM Malaysia open data. Federal Territories (Kuala Lumpur, Labuan, Putrajaya) are shown with their full names on hover.</p>
    </section>

    <footer>
      <p class="disclaimer">
        <strong>myuni-api is an unofficial, independent project</strong> and is not affiliated with, endorsed by, or operated on behalf of any university, the Ministry of Higher Education, or the Malaysian Qualifications Agency (MQA). All data is compiled from publicly available sources (official university websites and the MQA's MQR register) for general informational purposes only. It may contain errors or be out of date &mdash; always verify with the relevant institution before relying on it.
      </p>
      <p>
        Data is community-maintained and MIT-licensed. See <a href="/docs">API docs</a> for full endpoint reference and query filters.
      </p>
    </footer>
  </main>
  <div id="map-tooltip" role="presentation">
    <span class="tt-head"><span class="tt-swatch"></span><span class="tt-name"></span></span>
    <span class="tt-counts"></span>
    <span class="tt-hint">Click to filter &amp; zoom</span>
  </div>
  <script type="application/json" id="state-data">${payloadJson}</script>
  <script src="/landing.js" defer></script>
</body>
</html>`;

  res.type('html').send(html);
}
