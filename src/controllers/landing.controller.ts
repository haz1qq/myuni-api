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

// Malaysia is 13 states + 3 Federal Territories (Kuala Lumpur, Labuan,
// Putrajaya) = 16 divisions total, not 14. The API's `state` field keeps the
// existing "W.P. X" enum values (no breaking change to /api/campus?state=...
// or the data files) -- this is a display-only label used in the landing
// page UI so Federal Territories read correctly instead of being lumped in
// as if they were ordinary states.
const FEDERAL_TERRITORIES = new Set<MalaysianState>([
  'W.P. Kuala Lumpur',
  'W.P. Labuan',
  'W.P. Putrajaya',
]);

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

export function renderLanding(_req: Request, res: Response): void {
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

  const coveredStates = new Set(campuses.map((campus) => campus.state));
  const realStates = MALAYSIAN_STATES.filter((s) => !FEDERAL_TERRITORIES.has(s));
  const statesCovered = realStates.filter((s) => coveredStates.has(s)).length;
  const territoriesCovered = [...FEDERAL_TERRITORIES].filter((s) => coveredStates.has(s)).length;

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
  <title>myuni-api</title>
  <style>
    :root {
      color-scheme: light dark;
      --page: #f9f9f7;
      --surface: #fcfcfb;
      --text: #0b0b0b;
      --text-secondary: #52514e;
      --text-muted: #898781;
      --hairline: #e1e0d9;
      --border: rgba(11, 11, 11, 0.1);
      --accent: #2a78d6;
      --accent-soft: rgba(42, 120, 214, 0.1);
      --violet: #4a3aa7;
      --violet-soft: rgba(74, 58, 167, 0.1);
      --teal: #1a8f6b;
      --teal-soft: rgba(26, 143, 107, 0.1);
      --gold: #a15207;
      --gold-soft: rgba(161, 82, 7, 0.1);
      --rose: #a13a4a;
      --rose-soft: rgba(161, 58, 74, 0.1);
      --code-bg: rgba(42, 120, 214, 0.08);
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
      --map-none: #f0efec;
      --map-none-line: #dcd9d1;
      --map-1: #b7d3f6;
      --map-2: #6da7ec;
      --map-3: #2a78d6;
      --map-4: #104281;
      --dot: #eda100;
      --status-good: #006300;
      --status-bad: #d03b3b;
      --json-key: #1c5cab;
      --json-str: #006300;
      --json-num: #a15207;
      --json-lit: #4a3aa7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --page: #0d0d0d;
        --surface: #1a1a19;
        --text: #ffffff;
        --text-secondary: #c3c2b7;
        --text-muted: #898781;
        --hairline: #2c2c2a;
        --border: rgba(255, 255, 255, 0.1);
        --accent: #3987e5;
        --accent-soft: rgba(57, 135, 229, 0.16);
        --violet: #9085e9;
        --violet-soft: rgba(144, 133, 233, 0.16);
        --teal: #2fbf94;
        --teal-soft: rgba(47, 191, 148, 0.16);
        --gold: #d98c2b;
        --gold-soft: rgba(217, 140, 43, 0.16);
        --rose: #e2637a;
        --rose-soft: rgba(226, 99, 122, 0.16);
        --code-bg: rgba(57, 135, 229, 0.14);
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.4);
        --map-none: #2c2c2a;
        --map-none-line: #3a3a37;
        --map-1: #1c5cab;
        --map-2: #3987e5;
        --map-3: #6da7ec;
        --map-4: #b7d3f6;
        --dot: #eda100;
        --status-good: #0ca30c;
        --status-bad: #e66767;
        --json-key: #6ea8fe;
        --json-str: #3fb14c;
        --json-num: #eda100;
        --json-lit: #9085e9;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--page);
      color: var(--text);
      margin: 0;
      padding: 0 1.5rem 4rem;
      line-height: 1.5;
    }
    main { max-width: 1100px; margin: 0 auto; }
    header { padding: 3rem 0 1.5rem; }
    h1 { margin: 0 0 0.4rem; font-size: 2.25rem; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-secondary); margin: 0 0 1.5rem; font-size: 1.05rem; max-width: 62ch; }
    .links { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0; }
    .links a {
      color: var(--text);
      text-decoration: none;
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      font-size: 0.9rem;
      box-shadow: var(--shadow);
    }
    .links a:hover { border-color: var(--accent); color: var(--accent); }
    .links a.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin: 1.75rem 0 0;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      box-shadow: var(--shadow);
    }
    .stat .label { color: var(--text-secondary); font-size: 0.85rem; display: block; }
    .stat .value { font-size: 1.7rem; font-weight: 600; display: block; }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.25rem 1.25rem;
      box-shadow: var(--shadow);
      margin-top: 1.25rem;
    }
    .panel h2 { margin: 0 0 0.15rem; font-size: 1.15rem; }
    .panel .panel-sub { margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.88rem; }
    .search-hero .search-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    #uni-search {
      font: inherit;
      font-size: 1rem;
      flex: 1 1 240px;
      min-width: 0;
      color: var(--text);
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1.1rem;
      outline: none;
    }
    #uni-search:focus { border-color: var(--accent); }
    #uni-search::placeholder { color: var(--text-muted); }
    #state-select {
      font: inherit;
      font-size: 0.95rem;
      flex: 0 1 200px;
      min-width: 0;
      color: var(--text);
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 0.9rem;
      outline: none;
      cursor: pointer;
    }
    #state-select:focus { border-color: var(--accent); }
    .uni-filter {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0.85rem 0 0;
    }
    .uni-filter button {
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.3rem 0.8rem;
      cursor: pointer;
    }
    .uni-filter button:hover { border-color: var(--accent); color: var(--accent); }
    .uni-filter button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .uni-filter button.active[data-cat="IPTS"] { background: var(--violet); border-color: var(--violet); }
    .uni-filter button.active[data-cat="Polytechnic"] { background: var(--teal); border-color: var(--teal); }
    .uni-filter button.active[data-cat="Community College"] { background: var(--gold); border-color: var(--gold); }
    .uni-filter button.active[data-cat="MARA College"] { background: var(--rose); border-color: var(--rose); }
    .search-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin: 0.9rem 0 0;
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    #state-filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
      border-radius: 999px;
      padding: 0.2rem 0.3rem 0.2rem 0.7rem;
    }
    #state-filter-pill[hidden] {
      display: none;
    }
    #state-filter-clear {
      font: inherit;
      width: 18px;
      height: 18px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.12);
      color: inherit;
      cursor: pointer;
    }
    .uni-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .uni-item {
      font: inherit;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      min-width: 0;
      text-align: left;
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.55rem 0.75rem;
      cursor: pointer;
      color: var(--text);
      transition: border-color 120ms ease, background 120ms ease;
    }
    .uni-item:hover, .uni-item:focus-visible { border-color: var(--accent); }
    .uni-item.active { border-color: var(--accent); background: var(--accent-soft); }
    .uni-logo {
      position: relative;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface);
      border: 1px solid var(--hairline);
      border-radius: 8px;
      overflow: hidden;
    }
    .uni-logo img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
    .uni-monogram {
      font-size: 0.56rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--accent);
      text-align: center;
      padding: 0 2px;
    }
    .uni-logo img ~ .uni-monogram { display: none; }
    .uni-item-info { min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
    .uni-item-short {
      font-weight: 600;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .uni-item-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .uni-item-name {
      min-width: 0;
      font-size: 0.76rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .uni-cat {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      border-radius: 5px;
      padding: 0.08rem 0.35rem;
      flex-shrink: 0;
    }
    .uni-cat.ipta { color: var(--accent); background: var(--accent-soft); }
    .uni-cat.ipts { color: var(--violet); background: var(--violet-soft); }
    .uni-cat.polytechnic { color: var(--teal); background: var(--teal-soft); }
    .uni-cat.community-college { color: var(--gold); background: var(--gold-soft); }
    .uni-cat.mara-college { color: var(--rose); background: var(--rose-soft); }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-top: 1.1rem;
    }
    .pagination button {
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text);
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.4rem 1rem;
      cursor: pointer;
    }
    .pagination button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
    #page-indicator { font-size: 0.82rem; color: var(--text-muted); white-space: nowrap; }
    .two-col {
      display: grid;
      grid-template-columns: minmax(260px, 1.1fr) 1fr;
      gap: 1rem;
      margin-top: 1.25rem;
      animation: detail-row-reveal 220ms ease;
    }
    @keyframes detail-row-reveal {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .two-col { animation: none; }
    }
    .two-col[hidden] {
      display: none;
    }
    @media (max-width: 800px) {
      .two-col { grid-template-columns: 1fr; }
    }
    .two-col > .panel { margin-top: 0; min-height: 300px; }
    .map-wrap { position: relative; }
    svg.map { display: block; width: 100%; height: auto; touch-action: pan-y; }
    svg.map.zoomed { touch-action: none; cursor: grab; }
    svg.map.dragging, svg.map.dragging .state { cursor: grabbing; }
    .state {
      cursor: pointer;
      stroke: var(--surface);
      stroke-width: 1.5;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      transition: filter 120ms ease, opacity 160ms ease;
      outline: none;
    }
    .state[data-bin="0"] { fill: url(#nodata-hatch); }
    .state[data-bin="1"] { fill: var(--map-1); }
    .state[data-bin="2"] { fill: var(--map-2); }
    .state[data-bin="3"] { fill: var(--map-3); }
    .state[data-bin="4"] { fill: var(--map-4); }
    #nodata-hatch rect { fill: var(--map-none); }
    #nodata-hatch line { stroke: var(--map-none-line); stroke-width: 1.4; }
    .state:hover, .state:focus-visible { filter: brightness(1.12) saturate(1.15); }
    svg.map:not(.has-pin) #states:hover .state:not(:hover) { opacity: 0.75; }
    svg.map.has-pin .state:not(.pinned):not(:hover) { opacity: 0.55; }
    .state.pinned { stroke: var(--dot); stroke-width: 2.5; }
    .state.dim { opacity: 0.22 !important; }
    .campus-dot {
      fill: var(--dot);
      stroke: var(--surface);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    .campus-dot.lit { opacity: 1; }
    svg.map.uni-pin .campus-dot.lit {
      transform-box: fill-box;
      transform-origin: center;
      animation: dot-pulse 1.5s ease-in-out infinite;
    }
    @keyframes dot-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.45); }
    }
    @media (prefers-reduced-motion: reduce) {
      svg.map.uni-pin .campus-dot.lit { animation: none; }
    }
    .map-controls {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .map-controls button {
      width: 32px;
      height: 32px;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
      cursor: pointer;
    }
    .map-controls button:hover { border-color: var(--accent); color: var(--accent); }
    #zoom-hint {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      font-size: 0.95rem;
      font-weight: 600;
      border-radius: 10px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease;
    }
    #zoom-hint.show { opacity: 1; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.85rem;
      margin: 0.6rem 0 0.2rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    .legend .key {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      padding: 0.15rem 0.3rem;
      border-radius: 6px;
      cursor: default;
    }
    .legend button.key { cursor: pointer; }
    .legend button.key:hover, .legend button.key:focus-visible { background: var(--accent-soft); color: var(--text); }
    .legend .swatch { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }
    .legend .swatch.hatch {
      background: repeating-linear-gradient(45deg, var(--map-none) 0 3px, var(--map-none-line) 3px 4.4px);
    }
    .legend .dot-key {
      width: 9px; height: 9px; border-radius: 50%;
      background: var(--dot); border: 1.5px solid var(--surface);
      box-shadow: 0 0 0 1px var(--hairline);
      display: inline-block;
    }
    .map-note { margin: 0.35rem 0 0; font-size: 0.72rem; color: var(--text-muted); }
    #map-tooltip {
      position: fixed;
      z-index: 10;
      pointer-events: none;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.45rem 0.65rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 0.82rem;
      display: none;
      max-width: 260px;
    }
    #map-tooltip .tt-head { display: flex; align-items: center; gap: 0.4rem; }
    #map-tooltip .tt-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    #map-tooltip .tt-name { font-weight: 600; }
    #map-tooltip .tt-counts { color: var(--text-secondary); display: block; }
    #map-tooltip .tt-hint { color: var(--text-muted); font-size: 0.72rem; display: block; margin-top: 0.1rem; }
    #detail-title { margin: 0; font-size: 1.1rem; }
    #detail-meta { margin: 0.2rem 0 0.9rem; color: var(--text-secondary); font-size: 0.85rem; }
    .campus-list { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
    .campus-list li { border-bottom: 1px solid var(--hairline); }
    .campus-list li:last-child { border-bottom: none; }
    .campus-list button {
      font: inherit;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      width: 100%;
      padding: 0.4rem 0.15rem;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text);
      text-align: left;
    }
    .campus-list button:hover { color: var(--accent); }
    .campus-list .city { color: var(--text-muted); }
    .empty-note { color: var(--text-muted); font-size: 0.85rem; font-style: italic; }
    .tester-bar { display: flex; gap: 0.5rem; align-items: center; }
    .tester-bar code {
      flex: 1;
      background: var(--code-bg);
      color: var(--accent);
      padding: 0.45rem 0.6rem;
      border-radius: 8px;
      font-size: 0.82rem;
      overflow-x: auto;
      white-space: nowrap;
    }
    .tester-bar button {
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 0.45rem 0.95rem;
      cursor: pointer;
    }
    .tester-bar button:hover { filter: brightness(1.1); }
    .quick-links { display: flex; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }
    .quick-links button {
      font: inherit;
      font-size: 0.75rem;
      background: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.2rem 0.6rem;
      cursor: pointer;
      color: var(--text-secondary);
    }
    .quick-links button:hover { border-color: var(--accent); color: var(--accent); }
    .snippet-box {
      margin-top: 0.6rem;
      border: 1px solid var(--hairline);
      border-radius: 10px;
      overflow: hidden;
      background: var(--page);
    }
    .snippet-tabs {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.3rem 0.4rem;
      border-bottom: 1px solid var(--hairline);
    }
    .snippet-tabs button {
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: none;
      border: none;
      border-radius: 6px;
      padding: 0.2rem 0.55rem;
      cursor: pointer;
    }
    .snippet-tabs button:hover { color: var(--accent); }
    .snippet-tabs button.active { background: var(--accent-soft); color: var(--accent); }
    #copy-btn { margin-left: auto; border: 1px solid var(--border); }
    #copy-btn.copied { color: var(--status-good); border-color: var(--status-good); }
    #snippet {
      margin: 0;
      padding: 0.55rem 0.7rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.74rem;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre;
    }
    #tester-status { margin: 0.6rem 0 0.3rem; font-size: 0.8rem; color: var(--text-secondary); min-height: 1.2em; }
    #tester-status .st-good { color: var(--status-good); font-weight: 600; }
    #tester-status .st-bad { color: var(--status-bad); font-weight: 600; }
    #response {
      background: var(--page);
      border: 1px solid var(--hairline);
      border-radius: 10px;
      margin: 0;
      padding: 0.75rem 0.9rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.76rem;
      line-height: 1.45;
      max-height: 340px;
      overflow: auto;
      white-space: pre;
      transition: opacity 120ms ease;
    }
    #response.loading { opacity: 0.45; }
    .j-key { color: var(--json-key); }
    .j-str { color: var(--json-str); }
    .j-num { color: var(--json-num); }
    .j-lit { color: var(--json-lit); font-weight: 600; }
    footer {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--hairline);
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>myuni-api</h1>
      <p class="subtitle">Open-source REST API for Malaysian university and campus data (public &amp; private institutions). Search below, or browse the map by location.</p>
      <p class="links">
        <a class="primary" href="/docs">API docs</a>
        <a href="/health">Health check</a>
        <a href="/api/university"><code>/api/university</code></a>
        <a href="/api/campus"><code>/api/campus</code></a>
      </p>
      <div class="stats">
        <div class="stat">
          <span class="label">Universities</span>
          <span class="value">${universities.length}</span>
        </div>
        <div class="stat">
          <span class="label">Campuses</span>
          <span class="value">${campuses.length}</span>
        </div>
        <div class="stat">
          <span class="label">States covered</span>
          <span class="value">${statesCovered}/${realStates.length}</span>
        </div>
        <div class="stat">
          <span class="label">Territories covered</span>
          <span class="value">${territoriesCovered}/${FEDERAL_TERRITORIES.size}</span>
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

    <div class="two-col" id="detail-row" hidden>
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
        <div id="tester-status" role="status"></div>
        <pre id="response" aria-live="polite"></pre>
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
      Data is community-maintained and MIT-licensed. See <a href="/docs">API docs</a> for full endpoint reference and query filters.
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

const LANDING_SCRIPT = `(function () {
  'use strict';
  function catSlug(cat) {
    return cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var dataEl = document.getElementById('state-data');
  if (!dataEl) return;
  var PAYLOAD = JSON.parse(dataEl.textContent);
  var STATE_COUNTS = PAYLOAD.stateCounts;
  var STATE_LABELS = PAYLOAD.stateLabels;
  var ALL_UNIS = PAYLOAD.unis;
  var unisById = {};
  ALL_UNIS.forEach(function (uni) {
    unisById[uni.id] = uni;
  });

  function stateLabel(name) {
    return STATE_LABELS[name] || name;
  }

  var svg = document.getElementById('map-svg');
  var tooltip = document.getElementById('map-tooltip');
  var ttSwatch = tooltip.querySelector('.tt-swatch');
  var ttName = tooltip.querySelector('.tt-name');
  var ttCounts = tooltip.querySelector('.tt-counts');
  var endpointEl = document.getElementById('endpoint');
  var statusEl = document.getElementById('tester-status');
  var responseEl = document.getElementById('response');
  var runBtn = document.getElementById('run-btn');
  var zoomHint = document.getElementById('zoom-hint');
  var listEl = document.getElementById('uni-list');
  var emptyEl = document.getElementById('uni-empty');
  var countEl = document.getElementById('uni-count');
  var searchEl = document.getElementById('uni-search');
  var stateSelect = document.getElementById('state-select');
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.uni-filter button'));
  var statePill = document.getElementById('state-filter-pill');
  var statePillName = document.getElementById('state-filter-name');
  var statePillClear = document.getElementById('state-filter-clear');
  var pagePrev = document.getElementById('page-prev');
  var pageNext = document.getElementById('page-next');
  var pageIndicator = document.getElementById('page-indicator');
  var paginationEl = document.getElementById('pagination');
  var resultsCard = document.getElementById('results-card');
  var detailRow = document.getElementById('detail-row');
  var detailTitle = document.getElementById('detail-title');
  var detailMeta = document.getElementById('detail-meta');
  var detailCampuses = document.getElementById('detail-campuses');
  var detailEmpty = document.getElementById('detail-empty');

  var statePaths = Array.prototype.slice.call(document.querySelectorAll('.state'));
  var campusDots = Array.prototype.slice.call(document.querySelectorAll('.campus-dot'));

  /* ---------------- camera: zoom & pan ---------------- */
  var vb = svg.getAttribute('viewBox').split(' ').map(Number);
  var BASE = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  var MAX_SCALE = 10;
  var cam = { x: BASE.x, y: BASE.y, w: BASE.w, h: BASE.h };
  var animFrame = null;

  function clampCam(c) {
    c.w = Math.min(BASE.w, Math.max(BASE.w / MAX_SCALE, c.w));
    c.h = c.w * (BASE.h / BASE.w);
    c.x = Math.min(BASE.x + BASE.w - c.w, Math.max(BASE.x, c.x));
    c.y = Math.min(BASE.y + BASE.h - c.h, Math.max(BASE.y, c.y));
    return c;
  }

  function applyCam() {
    svg.setAttribute('viewBox', cam.x + ' ' + cam.y + ' ' + cam.w + ' ' + cam.h);
    var scale = BASE.w / cam.w;
    var r = 3.5 / Math.pow(scale, 0.6);
    if (r < 0.7) r = 0.7;
    campusDots.forEach(function (dot) {
      dot.setAttribute('r', r);
    });
    svg.classList.toggle('zoomed', scale > 1.02);
  }

  function animateTo(target, duration) {
    if (animFrame) cancelAnimationFrame(animFrame);
    var from = { x: cam.x, y: cam.y, w: cam.w, h: cam.h };
    var start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var e = 1 - Math.pow(1 - t, 3);
      cam.x = from.x + (target.x - from.x) * e;
      cam.y = from.y + (target.y - from.y) * e;
      cam.w = from.w + (target.w - from.w) * e;
      cam.h = from.h + (target.h - from.h) * e;
      applyCam();
      if (t < 1) animFrame = requestAnimationFrame(step);
    }
    animFrame = requestAnimationFrame(step);
  }

  function zoomAt(clientX, clientY, factor) {
    var rect = svg.getBoundingClientRect();
    var fx = (clientX - rect.left) / rect.width;
    var fy = (clientY - rect.top) / rect.height;
    var px = cam.x + fx * cam.w;
    var py = cam.y + fy * cam.h;
    var next = { w: cam.w / factor, h: 0, x: 0, y: 0 };
    next.w = Math.min(BASE.w, Math.max(BASE.w / MAX_SCALE, next.w));
    next.h = next.w * (BASE.h / BASE.w);
    next.x = px - fx * next.w;
    next.y = py - fy * next.h;
    cam = clampCam(next);
    applyCam();
  }

  function zoomToBBox(b) {
    var aspect = BASE.w / BASE.h;
    var w = Math.max(b.width * 1.5, b.height * 1.5 * aspect, 70);
    var target = clampCam({
      w: w,
      h: w / aspect,
      x: b.x + b.width / 2 - w / 2,
      y: b.y + b.height / 2 - (w / aspect) / 2,
    });
    animateTo(target, 320);
  }

  function resetView() {
    animateTo({ x: BASE.x, y: BASE.y, w: BASE.w, h: BASE.h }, 320);
  }

  document.getElementById('zoom-in').addEventListener('click', function () {
    var rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.6);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    var rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.6);
  });
  document.getElementById('zoom-reset').addEventListener('click', function () {
    clearUniPin();
    clearPin();
    resetView();
  });

  var hintTimer = null;
  svg.addEventListener(
    'wheel',
    function (event) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, Math.pow(1.0015, -event.deltaY));
      } else {
        zoomHint.classList.add('show');
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = setTimeout(function () {
          zoomHint.classList.remove('show');
        }, 1200);
      }
    },
    { passive: false }
  );

  /* drag to pan + two-finger pinch */
  var pointers = {};
  var didDrag = false;
  var downPos = null;

  function pointerList() {
    return Object.keys(pointers).map(function (id) {
      return pointers[id];
    });
  }

  function pointerCountNow() {
    return Object.keys(pointers).length;
  }

  svg.addEventListener('pointerdown', function (event) {
    /* A mouse only ever has one pointerId. If it's already tracked, the
       matching pointerup/pointercancel for the previous press was lost
       (can happen with fast clicks, focus changes, or automation) --
       without this reset, pointerCountNow() overshoots and every future
       click gets misrouted into the two-pointer pinch branch below, which
       unconditionally sets didDrag = true and silently swallows clicks. */
    if (event.pointerType === 'mouse') {
      pointers = {};
    }
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (pointerCountNow() === 1) {
      downPos = { x: event.clientX, y: event.clientY };
      didDrag = false;
    }
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', function (event) {
    var p = pointers[event.pointerId];
    if (!p) return;
    if (pointerCountNow() === 2) {
      var list = pointerList();
      var other = list[0] === p ? list[1] : list[0];
      var prevDist = Math.hypot(p.x - other.x, p.y - other.y);
      var newDist = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (prevDist > 0 && newDist > 0) {
        zoomAt((event.clientX + other.x) / 2, (event.clientY + other.y) / 2, newDist / prevDist);
      }
      didDrag = true;
    } else if (pointerCountNow() === 1) {
      var dx = event.clientX - p.x;
      var dy = event.clientY - p.y;
      if (!didDrag && downPos && Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) > 12) {
        didDrag = true;
        svg.classList.add('dragging');
      }
      if (didDrag) {
        var rect = svg.getBoundingClientRect();
        cam.x -= dx * (cam.w / rect.width);
        cam.y -= dy * (cam.h / rect.height);
        cam = clampCam(cam);
        applyCam();
      }
    }
    p.x = event.clientX;
    p.y = event.clientY;
  });

  function endPointer(event) {
    delete pointers[event.pointerId];
    if (pointerCountNow() <= 0) {
      svg.classList.remove('dragging');
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  /* swallow the click that follows a drag so it doesn't pin a state */
  svg.addEventListener(
    'click',
    function (event) {
      if (didDrag) {
        event.stopPropagation();
        event.preventDefault();
        didDrag = false;
      }
    },
    true
  );

  /* ---------------- API tester ---------------- */
  var currentUrl = null;
  var pinnedUni = null;
  var runTimer = null;
  var cache = {};

  var JSON_TOKEN = /("(?:[^"\\\\]|\\\\.)*")(\\s*:)?|\\b(?:true|false|null)\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/g;

  function renderJson(text) {
    responseEl.textContent = '';
    var frag = document.createDocumentFragment();
    var last = 0;
    var match;
    JSON_TOKEN.lastIndex = 0;
    while ((match = JSON_TOKEN.exec(text)) !== null) {
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      var span = document.createElement('span');
      if (match[1] !== undefined) {
        span.className = match[2] !== undefined ? 'j-key' : 'j-str';
        span.textContent = match[1];
        frag.appendChild(span);
        if (match[2] !== undefined) {
          frag.appendChild(document.createTextNode(match[2]));
        }
      } else if (match[0] === 'true' || match[0] === 'false' || match[0] === 'null') {
        span.className = 'j-lit';
        span.textContent = match[0];
        frag.appendChild(span);
      } else {
        span.className = 'j-num';
        span.textContent = match[0];
        frag.appendChild(span);
      }
      last = JSON_TOKEN.lastIndex;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    responseEl.appendChild(frag);
  }

  function showResult(rec) {
    if (rec.url !== currentUrl) return;
    responseEl.classList.remove('loading');
    statusEl.textContent = '';
    var strong = document.createElement('span');
    strong.className = rec.ok ? 'st-good' : 'st-bad';
    strong.textContent = rec.status + (rec.ok ? ' OK' : '');
    statusEl.appendChild(strong);
    statusEl.appendChild(document.createTextNode(' \\u00b7 ' + rec.ms + ' ms \\u00b7 GET ' + rec.url));
    if (rec.isJson) {
      renderJson(rec.body);
    } else {
      responseEl.textContent = rec.body;
    }
  }

  function run(url) {
    currentUrl = url;
    endpointEl.textContent = 'GET ' + url;
    updateSnippet();
    if (cache[url]) {
      showResult(cache[url]);
      return;
    }
    responseEl.classList.add('loading');
    statusEl.textContent = 'Loading\\u2026';
    var started = performance.now();
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.text().then(function (text) {
          return { status: res.status, ok: res.ok, text: text };
        });
      })
      .then(function (r) {
        var body;
        var isJson = true;
        try {
          body = JSON.stringify(JSON.parse(r.text), null, 2);
        } catch (e) {
          body = r.text;
          isJson = false;
        }
        var rec = {
          url: url,
          status: r.status,
          ok: r.ok,
          ms: Math.round(performance.now() - started),
          body: body,
          isJson: isJson,
        };
        cache[url] = rec;
        showResult(rec);
      })
      .catch(function (err) {
        if (url !== currentUrl) return;
        responseEl.classList.remove('loading');
        statusEl.textContent = 'Request failed: ' + err.message;
      });
  }

  /* ---------------- search, filter & pagination ---------------- */
  var PAGE_SIZE = 10;
  var filter = { query: '', cat: 'ALL', state: null, page: 1 };

  function matchesFilter(uni) {
    var okCat = filter.cat === 'ALL' || uni.cat === filter.cat;
    var okState = !filter.state || uni.states.indexOf(filter.state) !== -1;
    var okText = !filter.query || (uni.short + ' ' + uni.name).toLowerCase().indexOf(filter.query) !== -1;
    return okCat && okState && okText;
  }

  function getFiltered() {
    return ALL_UNIS.filter(matchesFilter);
  }

  function markActiveRow(id) {
    Array.prototype.slice.call(listEl.querySelectorAll('.uni-item')).forEach(function (el) {
      el.classList.toggle('active', id !== null && el.getAttribute('data-id') === id);
    });
  }

  function buildRow(uni) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'uni-item';
    row.setAttribute('data-id', uni.id);
    row.title = uni.name;

    var logo = document.createElement('span');
    logo.className = 'uni-logo';
    if (uni.logo) {
      var img = document.createElement('img');
      img.src = uni.logo;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        img.remove();
      });
      logo.appendChild(img);
    }
    var mono = document.createElement('span');
    mono.className = 'uni-monogram';
    mono.setAttribute('aria-hidden', 'true');
    var monoSource = uni.short && uni.short !== uni.id ? uni.short : uni.name;
    mono.textContent = monoSource.slice(0, 6);
    logo.appendChild(mono);
    row.appendChild(logo);

    var info = document.createElement('span');
    info.className = 'uni-item-info';

    var nameLine = document.createElement('span');
    nameLine.className = 'uni-item-short';
    var nameText = document.createElement('span');
    nameText.className = 'uni-item-title';
    /* short_name defaults to the id slug for institutions we couldn't find a
       real abbreviation for -- showing that raw slug as the headline is the
       exact mess from the old chip-wall design, so prefer the full name
       whenever short looks auto-generated. */
    nameText.textContent = uni.short && uni.short !== uni.id ? uni.short + ' \\u2014 ' + uni.name : uni.name;
    nameLine.appendChild(nameText);
    var catBadge = document.createElement('span');
    catBadge.className = 'uni-cat ' + catSlug(uni.cat);
    catBadge.textContent = uni.cat;
    nameLine.appendChild(catBadge);
    info.appendChild(nameLine);

    var metaLine = document.createElement('span');
    metaLine.className = 'uni-item-name';
    var metaParts = [uni.c.length + (uni.c.length === 1 ? ' campus' : ' campuses')];
    if (uni.states.length) metaParts.push(uni.states.map(stateLabel).join(', '));
    metaLine.textContent = metaParts.join(' \\u00b7 ');
    info.appendChild(metaLine);

    row.appendChild(info);
    row.addEventListener('click', function () {
      selectUniversity(uni.id);
    });
    return row;
  }

  function scrollToResults() {
    resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderResults() {
    var filtered = getFiltered();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (filter.page > totalPages) filter.page = totalPages;
    if (filter.page < 1) filter.page = 1;
    var start = (filter.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    listEl.textContent = '';
    pageItems.forEach(function (uni) {
      listEl.appendChild(buildRow(uni));
    });
    if (pinnedUni) markActiveRow(pinnedUni);

    emptyEl.hidden = filtered.length !== 0;
    countEl.textContent = filtered.length + (filtered.length === 1 ? ' university found' : ' universities found');
    pageIndicator.textContent = 'Page ' + filter.page + ' of ' + totalPages;
    pagePrev.disabled = filter.page <= 1;
    pageNext.disabled = filter.page >= totalPages;
    paginationEl.hidden = totalPages <= 1;
  }

  searchEl.addEventListener('input', function () {
    filter.query = searchEl.value.trim().toLowerCase();
    filter.page = 1;
    renderResults();
  });
  searchEl.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var filtered = getFiltered();
    if (filtered.length) selectUniversity(filtered[0].id);
  });

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filter.cat = btn.getAttribute('data-cat');
      filter.page = 1;
      filterBtns.forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      renderResults();
    });
  });

  pagePrev.addEventListener('click', function () {
    if (filter.page > 1) {
      filter.page--;
      renderResults();
      scrollToResults();
    }
  });
  pageNext.addEventListener('click', function () {
    filter.page++;
    renderResults();
    scrollToResults();
  });

  function setStateFilter(name) {
    filter.state = name;
    filter.page = 1;
    stateSelect.value = name || '';
    if (name) {
      statePillName.textContent = stateLabel(name);
      statePill.hidden = false;
    } else {
      statePill.hidden = true;
    }
    renderResults();
  }

  stateSelect.addEventListener('change', function () {
    var name = stateSelect.value || null;
    var path = name ? document.querySelector('.state[data-state="' + name + '"]') : null;
    if (path) {
      /* reuse the map's own click handler so the pin, zoom, and dot
         highlighting all stay in sync with a dropdown-driven selection */
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      clearUniPin();
      clearPin();
      setStateFilter(null);
    }
  });

  statePillClear.addEventListener('click', function () {
    setStateFilter(null);
    clearPin();
  });

  /* ---------------- detail card ---------------- */
  function renderDetail(uni) {
    detailEmpty.hidden = true;
    detailTitle.textContent = uni.name;
    var metaParts = [uni.cat, uni.c.length + (uni.c.length === 1 ? ' campus' : ' campuses')];
    if (uni.states.length) metaParts.push(uni.states.map(stateLabel).join(', '));
    detailMeta.textContent = metaParts.join(' \\u00b7 ');
    detailCampuses.textContent = '';
    uni.c.forEach(function (campus) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = campus.name;
      var citySpan = document.createElement('span');
      citySpan.className = 'city';
      citySpan.textContent = campus.city + ', ' + stateLabel(campus.state);
      btn.appendChild(nameSpan);
      btn.appendChild(citySpan);
      btn.addEventListener('click', function () {
        run('/api/campus/' + campus.id);
      });
      li.appendChild(btn);
      detailCampuses.appendChild(li);
    });
  }

  function clearDetail() {
    detailEmpty.hidden = false;
    detailTitle.textContent = '';
    detailMeta.textContent = '';
    detailCampuses.textContent = '';
  }

  /* ---------------- hover, tooltip, pin ---------------- */
  /* Dots are hidden by default (see .campus-dot CSS) and only revealed via
     .lit -- with 500+ campuses, showing them all at once turns the Klang
     Valley into an unreadable smudge. The state choropleth coloring already
     communicates density at a glance; dots are an on-demand detail layer
     shown only for a hovered/pinned state or a selected university. */
  function litDots(name) {
    campusDots.forEach(function (dot) {
      dot.classList.toggle('lit', name !== null && dot.getAttribute('data-state') === name);
    });
  }

  function moveTooltip(event) {
    var pad = 14;
    var rect = tooltip.getBoundingClientRect();
    var x = event.clientX + pad;
    var y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function fillTooltip(name, path) {
    ttName.textContent = stateLabel(name);
    var counts = STATE_COUNTS[name];
    ttCounts.textContent =
      counts.u + (counts.u === 1 ? ' university' : ' universities') +
      ' \\u00b7 ' + counts.c + (counts.c === 1 ? ' campus' : ' campuses');
    var fill = getComputedStyle(path).fill;
    ttSwatch.style.background = fill.indexOf('url') === 0 ? 'var(--map-none)' : fill;
  }

  var pinnedState = null;
  function clearPin() {
    if (!pinnedState) return;
    var prev = document.querySelector('.state.pinned');
    if (prev) prev.classList.remove('pinned');
    svg.classList.remove('has-pin');
    pinnedState = null;
    litDots(null);
  }

  statePaths.forEach(function (path) {
    var name = path.getAttribute('data-state');

    path.addEventListener('pointerenter', function (event) {
      fillTooltip(name, path);
      tooltip.style.display = 'block';
      moveTooltip(event);
      if (!pinnedState) litDots(name);
    });
    path.addEventListener('pointermove', moveTooltip);
    path.addEventListener('pointerleave', function () {
      tooltip.style.display = 'none';
      if (!pinnedState) litDots(null);
    });
    path.addEventListener('focus', function () {
      fillTooltip(name, path);
      if (!pinnedState) litDots(name);
    });
    path.addEventListener('blur', function () {
      if (!pinnedState) litDots(null);
    });
    path.addEventListener('click', function () {
      tooltip.style.display = 'none';
      if (pinnedState === name) {
        clearPin();
        setStateFilter(null);
        resetView();
        return;
      }
      clearUniPin();
      clearPin();
      pinnedState = name;
      path.classList.add('pinned');
      svg.classList.add('has-pin');
      litDots(name);
      setStateFilter(name);
      zoomToBBox(path.getBBox());
      scrollToResults();
    });
    path.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        path.click();
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      clearUniPin();
      clearPin();
      setStateFilter(null);
      resetView();
    }
  });

  /* legend keys highlight their bin on the map */
  Array.prototype.slice.call(document.querySelectorAll('.legend button.key')).forEach(function (btn) {
    var bin = btn.getAttribute('data-bin');
    function focusBin() {
      statePaths.forEach(function (path) {
        path.classList.toggle('dim', path.getAttribute('data-bin') !== bin);
      });
    }
    function unfocusBin() {
      statePaths.forEach(function (path) {
        path.classList.remove('dim');
      });
    }
    btn.addEventListener('pointerenter', focusBin);
    btn.addEventListener('pointerleave', unfocusBin);
    btn.addEventListener('focus', focusBin);
    btn.addEventListener('blur', unfocusBin);
  });

  /* ---------------- university selection ---------------- */
  function highlightUni(id) {
    campusDots.forEach(function (dot) {
      dot.classList.toggle('lit', dot.getAttribute('data-university') === id);
    });
    var uni = unisById[id];
    var states = uni ? uni.states : [];
    statePaths.forEach(function (path) {
      path.classList.toggle('dim', states.indexOf(path.getAttribute('data-state')) === -1);
    });
  }

  function clearUniPin() {
    if (!pinnedUni) return;
    pinnedUni = null;
    svg.classList.remove('uni-pin');
    markActiveRow(null);
    statePaths.forEach(function (path) {
      path.classList.remove('dim');
    });
    litDots(pinnedState);
    clearDetail();
    detailRow.hidden = true;
  }

  function zoomToUni(id) {
    var xs = [];
    var ys = [];
    campusDots.forEach(function (dot) {
      if (dot.getAttribute('data-university') === id) {
        xs.push(Number(dot.getAttribute('cx')));
        ys.push(Number(dot.getAttribute('cy')));
      }
    });
    if (xs.length === 0) {
      resetView();
      return;
    }
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    zoomToBBox({ x: minX - 12, y: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24 });
  }

  function selectUniversity(id) {
    if (pinnedUni === id) {
      clearUniPin();
      resetView();
      return;
    }
    clearPin();
    pinnedUni = id;
    svg.classList.add('uni-pin');
    markActiveRow(id);
    highlightUni(id);
    zoomToUni(id);
    renderDetail(unisById[id]);
    detailRow.hidden = false;
    if (runTimer) clearTimeout(runTimer);
    run('/api/university/' + id);
  }

  runBtn.addEventListener('click', function () {
    run(currentUrl);
  });

  Array.prototype.slice.call(document.querySelectorAll('.quick-links button')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      run(btn.getAttribute('data-url'));
    });
  });

  /* ---------------- copy as URL / cURL / JS / Python ---------------- */
  var snippetEl = document.getElementById('snippet');
  var copyBtn = document.getElementById('copy-btn');
  var snippetTabs = Array.prototype.slice.call(
    document.querySelectorAll('.snippet-tabs button[data-lang]')
  );
  var activeLang = 'url';

  function snippetFor(lang, url) {
    var full = window.location.origin + url;
    if (lang === 'curl') {
      return 'curl -s "' + full + '"';
    }
    if (lang === 'js') {
      return (
        "const res = await fetch('" + full + "');\\n" +
        'const data = await res.json();\\n' +
        'console.log(data);'
      );
    }
    if (lang === 'py') {
      return (
        'import requests\\n\\n' +
        'data = requests.get("' + full + '").json()\\n' +
        'print(data)'
      );
    }
    return full;
  }

  function updateSnippet() {
    snippetEl.textContent = snippetFor(activeLang, currentUrl);
  }

  snippetTabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeLang = btn.getAttribute('data-lang');
      snippetTabs.forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      updateSnippet();
    });
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* nothing else to try */
    }
    document.body.removeChild(ta);
  }

  var copyTimer = null;
  copyBtn.addEventListener('click', function () {
    var text = snippetEl.textContent;
    function done() {
      copyBtn.classList.add('copied');
      copyBtn.textContent = 'Copied!';
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(function () {
        copyBtn.classList.remove('copied');
        copyBtn.textContent = 'Copy';
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  });

  /* ---------------- init ---------------- */
  clearDetail();
  renderResults();
  run('/api/university');
})();
`;

export function serveLandingScript(_req: Request, res: Response): void {
  res.type('application/javascript').send(LANDING_SCRIPT);
}
