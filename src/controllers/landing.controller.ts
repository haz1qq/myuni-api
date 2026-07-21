import type { Request, Response } from 'express';
import { findUniversities } from '../services/university.service.js';
import { findCampuses } from '../services/campus.service.js';
import type { Campus } from '../schemas/campus.schema.js';
import type { University } from '../schemas/university.schema.js';
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

/** Campus-count bin: 0 = no data, 1..4 = sequential ramp steps. */
function binForCount(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

interface StatePayload {
  u: Array<{ id: string; name: string; short: string; cat: string; logo?: string }>;
  c: Array<{ id: string; name: string; city: string; u: string }>;
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

  const universityById = new Map<string, University>(universities.map((u) => [u.id, u]));

  const stateData = {} as Record<MalaysianState, StatePayload>;
  for (const state of MALAYSIAN_STATES) {
    const stateCampuses = (campusesByState.get(state) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const uniIds = [...new Set(stateCampuses.map((c) => c.university_id))];
    const unis = uniIds
      .map((id) => universityById.get(id))
      .filter((u): u is University => u !== undefined)
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
    stateData[state] = {
      u: unis.map((u) => ({
        id: u.id,
        name: u.name,
        short: u.short_name,
        cat: u.category,
        logo: u.logo,
      })),
      c: stateCampuses.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        u: universityById.get(c.university_id)?.short_name ?? c.university_id,
      })),
    };
  }

  const stateCount = new Set(campuses.map((campus) => campus.state)).size;

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

  const uniItems = directory
    .map((u) => {
      const logoImg = u.logo ? `<img src="${escapeHtml(u.logo)}" alt="" loading="lazy" />` : '';
      const catClass = u.cat === 'IPTA' ? 'ipta' : 'ipts';
      const searchText = `${u.short} ${u.name}`.toLowerCase();
      return `
          <button class="uni-item" type="button" data-id="${escapeHtml(u.id)}" data-cat="${escapeHtml(u.cat)}" data-q="${escapeHtml(searchText)}" title="${escapeHtml(u.name)}">
            <span class="uni-logo">${logoImg}<span class="uni-monogram" aria-hidden="true">${escapeHtml(u.short.slice(0, 6))}</span></span>
            <span class="uni-item-info">
              <span class="uni-item-short">${escapeHtml(u.short)}<span class="uni-cat ${catClass}">${escapeHtml(u.cat)}</span></span>
              <span class="uni-item-name">${escapeHtml(u.name)}</span>
            </span>
          </button>`;
    })
    .join('');

  const statePathsMarkup = MALAYSIAN_STATES.map((state) => {
    const payload = stateData[state];
    const bin = binForCount(payload.c.length);
    const label = `${state}: ${payload.u.length} universit${payload.u.length === 1 ? 'y' : 'ies'}, ${payload.c.length} campus${payload.c.length === 1 ? '' : 'es'}`;
    return `<path class="state" data-state="${escapeHtml(state)}" data-bin="${bin}" d="${STATE_PATHS[state]}" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="${escapeHtml(label)}" />`;
  }).join('\n        ');

  const campusDots = campuses
    .map((campus) => {
      const { x, y } = projectToMap(campus.longitude, campus.latitude);
      return `<circle class="campus-dot" data-state="${escapeHtml(campus.state)}" data-university="${escapeHtml(campus.university_id)}" cx="${x}" cy="${y}" r="3.5" vector-effect="non-scaling-stroke" />`;
    })
    .join('\n        ');

  const payloadJson = JSON.stringify({ states: stateData, unis: directory }).replace(
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
    .map-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.25rem 1.25rem 0.9rem;
      box-shadow: var(--shadow);
      margin-top: 1.25rem;
    }
    .map-card h2 { margin: 0 0 0.15rem; font-size: 1.15rem; }
    .map-card .map-sub { margin: 0 0 0.75rem; color: var(--text-secondary); font-size: 0.88rem; }
    .map-layout {
      display: grid;
      grid-template-columns: minmax(230px, 270px) 1fr;
      gap: 1rem;
      align-items: stretch;
    }
    .uni-panel { position: relative; }
    .uni-panel-inner {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 800px) {
      .map-layout { grid-template-columns: 1fr; }
      .uni-panel-inner { position: static; }
      .uni-list { max-height: 260px; flex: none; }
    }
    #uni-search {
      font: inherit;
      font-size: 0.85rem;
      width: 100%;
      color: var(--text);
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.4rem 0.9rem;
      outline: none;
    }
    #uni-search:focus { border-color: var(--accent); }
    #uni-search::placeholder { color: var(--text-muted); }
    .uni-filter {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      margin: 0.5rem 0 0.35rem;
    }
    .uni-filter button {
      font: inherit;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.2rem 0.65rem;
      cursor: pointer;
    }
    .uni-filter button:hover { border-color: var(--accent); color: var(--accent); }
    .uni-filter button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .uni-filter button.active[data-cat="IPTS"] { background: var(--violet); border-color: var(--violet); }
    #uni-count { margin-left: auto; font-size: 0.73rem; color: var(--text-muted); white-space: nowrap; }
    .uni-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0.15rem 0.35rem 0.15rem 0.15rem;
      scrollbar-width: thin;
    }
    .uni-item {
      font: inherit;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-shrink: 0;
      text-align: left;
      background: var(--page);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.4rem 0.55rem;
      cursor: pointer;
      color: var(--text);
      transition: border-color 120ms ease, background 120ms ease;
    }
    .uni-item:hover, .uni-item:focus-visible { border-color: var(--accent); }
    .uni-item.active { border-color: var(--accent); background: var(--accent-soft); }
    .uni-item[hidden] { display: none; }
    .uni-logo {
      position: relative;
      width: 36px;
      height: 36px;
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
      font-size: 0.52rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--accent);
      text-align: center;
      padding: 0 2px;
    }
    .uni-logo img ~ .uni-monogram { display: none; }
    .uni-item-info { min-width: 0; display: flex; flex-direction: column; gap: 0.05rem; }
    .uni-item-short {
      font-weight: 600;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .uni-item-name {
      font-size: 0.7rem;
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
    }
    .uni-cat.ipta { color: var(--accent); background: var(--accent-soft); }
    .uni-cat.ipts { color: var(--violet); background: var(--violet-soft); }
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
      transition: opacity 160ms ease;
    }
    svg.map.focus .campus-dot { opacity: 0.3; }
    svg.map.focus .campus-dot.lit { opacity: 1; }
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
    .explorer {
      display: grid;
      grid-template-columns: minmax(260px, 2fr) 3fr;
      gap: 1rem;
      margin-top: 1rem;
    }
    @media (max-width: 800px) {
      .explorer { grid-template-columns: 1fr; }
    }
    .explorer > div {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.1rem 1.25rem;
      box-shadow: var(--shadow);
      min-height: 320px;
    }
    .explorer h3 { margin: 0; font-size: 1.15rem; }
    #panel-counts { margin: 0.15rem 0 0.9rem; color: var(--text-secondary); font-size: 0.88rem; }
    .panel-section-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0.9rem 0 0.4rem;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chip {
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 0.28rem 0.7rem;
      cursor: pointer;
      color: var(--text);
      background: var(--accent-soft);
    }
    .chip img { width: 16px; height: 16px; object-fit: contain; border-radius: 3px; }
    .chip::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent);
    }
    .chip.ipts { background: var(--violet-soft); }
    .chip.ipts::before { background: var(--violet); }
    .chip.has-logo::before { display: none; }
    .chip:hover { border-color: var(--accent); }
    .chip.ipts:hover { border-color: var(--violet); }
    .campus-list { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
    .campus-list li { border-bottom: 1px solid var(--hairline); }
    .campus-list li:last-child { border-bottom: none; }
    .campus-list button {
      font: inherit;
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      padding: 0.4rem 0.15rem;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text);
      text-align: left;
    }
    .campus-list button:hover { color: var(--accent); }
    .campus-list .city { color: var(--text-muted); white-space: nowrap; }
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
      <p class="subtitle">Open-source REST API for Malaysian university and campus data (public &amp; private institutions). Hover a state to explore it and call the API live.</p>
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
          <span class="value">${stateCount}</span>
        </div>
      </div>
    </header>
    <section class="map-card">
      <h2>Explore the map</h2>
      <p class="map-sub">Search or filter universities and click one to pinpoint its campuses, or hover a state &mdash; click to pin &amp; zoom, Ctrl + scroll to zoom, drag to pan.</p>
      <div class="map-layout">
      <div class="uni-panel">
        <div class="uni-panel-inner">
          <input id="uni-search" type="search" placeholder="Search ${universities.length} universities&hellip;" aria-label="Search universities" autocomplete="off" />
          <div class="uni-filter" role="group" aria-label="Filter universities by category">
            <button type="button" class="active" data-cat="ALL">All</button>
            <button type="button" data-cat="IPTA">IPTA</button>
            <button type="button" data-cat="IPTS">IPTS</button>
            <span id="uni-count">${universities.length} shown</span>
          </div>
          <div class="uni-list" id="uni-list" aria-label="Universities">${uniItems}
            <p class="empty-note" id="uni-empty" hidden>No universities match.</p>
          </div>
        </div>
      </div>
      <div class="map-wrap">
        <svg id="map-svg" class="map" viewBox="${MAP_VIEWBOX}" role="group" aria-label="Map of Malaysia. Each state is a button that loads its universities and campuses.">
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
      </div>
      <div class="legend">
        <button class="key" type="button" data-bin="0" aria-label="Highlight states with no campuses"><span class="swatch hatch"></span>No campuses</button>
        <button class="key" type="button" data-bin="1" aria-label="Highlight states with 1 to 2 campuses"><span class="swatch" style="background: var(--map-1)"></span>1&ndash;2</button>
        <button class="key" type="button" data-bin="2" aria-label="Highlight states with 3 to 4 campuses"><span class="swatch" style="background: var(--map-2)"></span>3&ndash;4</button>
        <button class="key" type="button" data-bin="3" aria-label="Highlight states with 5 to 7 campuses"><span class="swatch" style="background: var(--map-3)"></span>5&ndash;7</button>
        <button class="key" type="button" data-bin="4" aria-label="Highlight states with 8 or more campuses"><span class="swatch" style="background: var(--map-4)"></span>8+</button>
        <span class="key"><span class="dot-key"></span>Campus location</span>
      </div>
      <p class="map-note">Sea gap between the Peninsula and Borneo is compressed for layout. State boundaries: DOSM Malaysia open data.</p>
    </section>
    <section class="explorer">
      <div>
        <h3 id="panel-title">Pick a state</h3>
        <p id="panel-counts">Hover or tap any state on the map.</p>
        <p class="panel-section-label" id="unis-label" hidden>Universities &mdash; click to call the API</p>
        <div class="chips" id="panel-unis"></div>
        <p class="panel-section-label" id="campuses-label" hidden>Campuses</p>
        <ul class="campus-list" id="panel-campuses"></ul>
      </div>
      <div>
        <div class="tester-bar">
          <code id="endpoint">GET /api/campus</code>
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
    </section>
    <footer>
      Data is community-maintained and MIT-licensed. See <a href="/docs">API docs</a> for full endpoint reference and query filters.
    </footer>
  </main>
  <div id="map-tooltip" role="presentation">
    <span class="tt-head"><span class="tt-swatch"></span><span class="tt-name"></span></span>
    <span class="tt-counts"></span>
    <span class="tt-hint">Click to pin &amp; zoom</span>
  </div>
  <script type="application/json" id="state-data">${payloadJson}</script>
  <script src="/landing.js" defer></script>
</body>
</html>`;

  res.type('html').send(html);
}

const LANDING_SCRIPT = `(function () {
  'use strict';
  var dataEl = document.getElementById('state-data');
  if (!dataEl) return;
  var PAYLOAD = JSON.parse(dataEl.textContent);
  var STATES = PAYLOAD.states;
  var unisById = {};
  PAYLOAD.unis.forEach(function (uni) {
    unisById[uni.id] = uni;
  });

  var svg = document.getElementById('map-svg');
  var tooltip = document.getElementById('map-tooltip');
  var ttSwatch = tooltip.querySelector('.tt-swatch');
  var ttName = tooltip.querySelector('.tt-name');
  var ttCounts = tooltip.querySelector('.tt-counts');
  var panelTitle = document.getElementById('panel-title');
  var panelCounts = document.getElementById('panel-counts');
  var panelUnis = document.getElementById('panel-unis');
  var panelCampuses = document.getElementById('panel-campuses');
  var unisLabel = document.getElementById('unis-label');
  var campusesLabel = document.getElementById('campuses-label');
  var endpointEl = document.getElementById('endpoint');
  var statusEl = document.getElementById('tester-status');
  var responseEl = document.getElementById('response');
  var runBtn = document.getElementById('run-btn');
  var zoomHint = document.getElementById('zoom-hint');

  var statePaths = Array.prototype.slice.call(document.querySelectorAll('.state'));
  var campusDots = Array.prototype.slice.call(document.querySelectorAll('.campus-dot'));
  var uniItems = Array.prototype.slice.call(document.querySelectorAll('.uni-item'));

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
  var pointerCount = 0;
  var didDrag = false;
  var downPos = null;

  function pointerList() {
    return Object.keys(pointers).map(function (id) {
      return pointers[id];
    });
  }

  svg.addEventListener('pointerdown', function (event) {
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    pointerCount++;
    if (pointerCount === 1) {
      downPos = { x: event.clientX, y: event.clientY };
      didDrag = false;
    }
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', function (event) {
    var p = pointers[event.pointerId];
    if (!p) return;
    if (pointerCount === 2) {
      var list = pointerList();
      var other = list[0] === p ? list[1] : list[0];
      var prevDist = Math.hypot(p.x - other.x, p.y - other.y);
      var newDist = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (prevDist > 0 && newDist > 0) {
        zoomAt((event.clientX + other.x) / 2, (event.clientY + other.y) / 2, newDist / prevDist);
      }
      didDrag = true;
    } else if (pointerCount === 1) {
      var dx = event.clientX - p.x;
      var dy = event.clientY - p.y;
      if (!didDrag && downPos && Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) > 5) {
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
    if (pointers[event.pointerId]) {
      delete pointers[event.pointerId];
      pointerCount--;
    }
    if (pointerCount <= 0) {
      pointerCount = 0;
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
  var currentUrl = '/api/campus';
  var pinnedState = null;
  var pinnedUni = null;
  var runTimer = null;
  var cache = {};

  function stateEndpoint(name) {
    return '/api/campus?state=' + encodeURIComponent(name);
  }

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

  function scheduleRun(url) {
    if (runTimer) clearTimeout(runTimer);
    currentUrl = url;
    endpointEl.textContent = 'GET ' + url;
    updateSnippet();
    runTimer = setTimeout(function () {
      run(url);
    }, 250);
  }

  /* ---------------- state panel ---------------- */
  function countsText(data) {
    return (
      data.u.length + (data.u.length === 1 ? ' university' : ' universities') +
      ' \\u00b7 ' + data.c.length + (data.c.length === 1 ? ' campus' : ' campuses')
    );
  }

  function renderPanel(name) {
    var data = STATES[name];
    if (!data) return;
    panelTitle.textContent = name;
    panelCounts.textContent = countsText(data);

    panelUnis.textContent = '';
    panelCampuses.textContent = '';
    unisLabel.hidden = data.u.length === 0;
    campusesLabel.hidden = data.c.length === 0;

    if (data.u.length === 0) {
      var note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'No campuses on record here yet \\u2014 the API returns an empty list.';
      panelUnis.appendChild(note);
    }

    data.u.forEach(function (uni) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (uni.cat === 'IPTS' ? ' ipts' : '');
      if (uni.logo) {
        var img = document.createElement('img');
        img.src = uni.logo;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', function () {
          img.remove();
          chip.classList.remove('has-logo');
        });
        chip.appendChild(img);
        chip.classList.add('has-logo');
      }
      chip.appendChild(document.createTextNode(uni.short));
      chip.title = uni.name + ' (' + uni.cat + ')';
      chip.addEventListener('click', function () {
        run('/api/university/' + uni.id);
      });
      panelUnis.appendChild(chip);
    });

    data.c.forEach(function (campus) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = campus.name;
      var citySpan = document.createElement('span');
      citySpan.className = 'city';
      citySpan.textContent = campus.u + ' \\u00b7 ' + campus.city;
      btn.appendChild(nameSpan);
      btn.appendChild(citySpan);
      btn.addEventListener('click', function () {
        run('/api/campus/' + campus.id);
      });
      li.appendChild(btn);
      panelCampuses.appendChild(li);
    });
  }

  function selectState(name, immediate) {
    renderPanel(name);
    if (immediate) {
      if (runTimer) clearTimeout(runTimer);
      run(stateEndpoint(name));
    } else {
      scheduleRun(stateEndpoint(name));
    }
  }

  /* ---------------- hover, tooltip, pin ---------------- */
  function litDots(name) {
    if (name) {
      svg.classList.add('focus');
      campusDots.forEach(function (dot) {
        dot.classList.toggle('lit', dot.getAttribute('data-state') === name);
      });
    } else {
      svg.classList.remove('focus');
      campusDots.forEach(function (dot) {
        dot.classList.remove('lit');
      });
    }
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
    ttName.textContent = name;
    ttCounts.textContent = countsText(STATES[name]);
    var fill = getComputedStyle(path).fill;
    ttSwatch.style.background = fill.indexOf('url') === 0 ? 'var(--map-none)' : fill;
  }

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
      litDots(name);
      if (!pinnedState && !pinnedUni) selectState(name, false);
    });
    path.addEventListener('pointermove', moveTooltip);
    path.addEventListener('pointerleave', function () {
      tooltip.style.display = 'none';
      clearUniHighlight();
    });
    path.addEventListener('focus', function () {
      litDots(name);
      if (!pinnedState && !pinnedUni) selectState(name, false);
    });
    path.addEventListener('blur', function () {
      clearUniHighlight();
    });
    path.addEventListener('click', function () {
      tooltip.style.display = 'none';
      if (pinnedState === name) {
        clearPin();
        resetView();
        return;
      }
      clearUniPin();
      clearPin();
      pinnedState = name;
      path.classList.add('pinned');
      svg.classList.add('has-pin');
      litDots(name);
      selectState(name, true);
      zoomToBBox(path.getBBox());
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
    svg.classList.add('focus');
    campusDots.forEach(function (dot) {
      dot.classList.toggle('lit', dot.getAttribute('data-university') === id);
    });
    var uni = unisById[id];
    var states = uni ? uni.states : [];
    statePaths.forEach(function (path) {
      path.classList.toggle('dim', states.indexOf(path.getAttribute('data-state')) === -1);
    });
  }

  function clearUniHighlight() {
    if (pinnedUni) {
      highlightUni(pinnedUni);
      return;
    }
    statePaths.forEach(function (path) {
      path.classList.remove('dim');
    });
    litDots(pinnedState);
  }

  function markActive(id) {
    uniItems.forEach(function (el) {
      el.classList.toggle('active', id !== null && el.getAttribute('data-id') === id);
    });
  }

  function clearUniPin() {
    if (!pinnedUni) return;
    pinnedUni = null;
    svg.classList.remove('uni-pin');
    markActive(null);
    statePaths.forEach(function (path) {
      path.classList.remove('dim');
    });
    litDots(pinnedState);
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

  function renderUniPanel(uni) {
    panelTitle.textContent = uni.short;
    panelCounts.textContent =
      uni.name + ' \\u00b7 ' + uni.cat +
      ' \\u00b7 ' + uni.c.length + (uni.c.length === 1 ? ' campus' : ' campuses') +
      ' \\u00b7 ' + uni.states.length + (uni.states.length === 1 ? ' state' : ' states');
    panelUnis.textContent = '';
    unisLabel.hidden = true;
    campusesLabel.hidden = uni.c.length === 0;
    panelCampuses.textContent = '';
    uni.c.forEach(function (campus) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      var nameSpan = document.createElement('span');
      nameSpan.textContent = campus.name;
      var citySpan = document.createElement('span');
      citySpan.className = 'city';
      citySpan.textContent = campus.city + ', ' + campus.state;
      btn.appendChild(nameSpan);
      btn.appendChild(citySpan);
      btn.addEventListener('click', function () {
        run('/api/campus/' + campus.id);
      });
      li.appendChild(btn);
      panelCampuses.appendChild(li);
    });
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
    markActive(id);
    highlightUni(id);
    zoomToUni(id);
    renderUniPanel(unisById[id]);
    if (runTimer) clearTimeout(runTimer);
    run('/api/university/' + id);
  }

  uniItems.forEach(function (el) {
    var id = el.getAttribute('data-id');
    var img = el.querySelector('img');
    if (img) {
      img.addEventListener('error', function () {
        img.remove();
      });
    }
    el.addEventListener('click', function () {
      selectUniversity(id);
    });
    el.addEventListener('pointerenter', function () {
      highlightUni(id);
    });
    el.addEventListener('pointerleave', clearUniHighlight);
    el.addEventListener('focus', function () {
      highlightUni(id);
    });
    el.addEventListener('blur', clearUniHighlight);
  });

  /* ---------------- university search & category filter ---------------- */
  var uniSearch = document.getElementById('uni-search');
  var uniCountEl = document.getElementById('uni-count');
  var uniEmpty = document.getElementById('uni-empty');
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.uni-filter button'));
  var activeCat = 'ALL';

  function applyUniFilter() {
    var q = uniSearch.value.trim().toLowerCase();
    var shown = 0;
    uniItems.forEach(function (el) {
      var okCat = activeCat === 'ALL' || el.getAttribute('data-cat') === activeCat;
      var okText = q === '' || el.getAttribute('data-q').indexOf(q) !== -1;
      var ok = okCat && okText;
      el.hidden = !ok;
      if (ok) shown++;
    });
    uniCountEl.textContent = shown + ' shown';
    uniEmpty.hidden = shown !== 0;
  }

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeCat = btn.getAttribute('data-cat');
      filterBtns.forEach(function (other) {
        other.classList.toggle('active', other === btn);
      });
      applyUniFilter();
    });
  });

  uniSearch.addEventListener('input', applyUniFilter);
  uniSearch.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var first = null;
    uniItems.some(function (el) {
      if (!el.hidden) {
        first = el;
        return true;
      }
      return false;
    });
    if (first) first.click();
  });

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

  updateSnippet();

  /* Preselect the busiest state so the page opens with live data on screen. */
  var busiest = null;
  var busiestCount = -1;
  Object.keys(STATES).forEach(function (name) {
    if (STATES[name].c.length > busiestCount) {
      busiest = name;
      busiestCount = STATES[name].c.length;
    }
  });
  if (busiest) selectState(busiest, true);
})();
`;

export function serveLandingScript(_req: Request, res: Response): void {
  res.type('application/javascript').send(LANDING_SCRIPT);
}
