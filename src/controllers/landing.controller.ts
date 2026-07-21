import type { Request, Response } from 'express';
import { findUniversities } from '../services/university.service.js';
import { findCampuses } from '../services/campus.service.js';
import type { Campus } from '../schemas/campus.schema.js';
import type { University } from '../schemas/university.schema.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCampusRow(campus: Campus): string {
  const endpoint = `/api/campuses/${campus.id}`;
  return `
              <tr>
                <td>
                  <a class="campus-link" href="${endpoint}">${escapeHtml(campus.name)}</a>
                </td>
                <td>${escapeHtml(campus.city)}, ${escapeHtml(campus.state)}</td>
                <td>${escapeHtml(campus.postcode)}</td>
                <td><a href="${endpoint}"><code>${endpoint}</code></a></td>
              </tr>`;
}

function renderUniversityCard(university: University, campuses: Campus[]): string {
  const universityEndpoint = `/api/universities/${university.id}`;
  const categoryClass = university.category === 'IPTA' ? 'badge-ipta' : 'badge-ipts';
  const campusRows = campuses.map(renderCampusRow).join('');
  const campusSection =
    campuses.length > 0
      ? `
          <details class="campuses" open>
            <summary>${campuses.length} campus${campuses.length === 1 ? '' : 'es'}</summary>
            <table>
              <thead>
                <tr>
                  <th>Campus</th>
                  <th>Location</th>
                  <th>Postcode</th>
                  <th>Try it</th>
                </tr>
              </thead>
              <tbody>${campusRows}
              </tbody>
            </table>
          </details>`
      : `
          <p class="no-campuses">No campuses on record yet.</p>`;

  return `
      <article class="card">
        <div class="card-head">
          <div>
            <h3>${escapeHtml(university.name)}</h3>
            <p class="short-name">${escapeHtml(university.short_name)} &middot; est. ${university.established}</p>
          </div>
          <span class="badge ${categoryClass}">${escapeHtml(university.category)}</span>
        </div>
        <dl class="meta">
          <div>
            <dt>Students</dt>
            <dd>${escapeHtml(university.student_range)}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd><a href="${escapeHtml(university.website)}" rel="noopener noreferrer">${escapeHtml(university.website)}</a></dd>
          </div>
        </dl>
        ${campusSection}
        <a class="api-link" href="${universityEndpoint}"><code>${universityEndpoint}</code></a>
      </article>`;
}

export function renderLanding(_req: Request, res: Response): void {
  const universities = findUniversities({});
  const campuses = findCampuses({});
  const campusesByUniversity = new Map<string, Campus[]>();
  for (const campus of campuses) {
    const list = campusesByUniversity.get(campus.university_id) ?? [];
    list.push(campus);
    campusesByUniversity.set(campus.university_id, list);
  }

  const stateCount = new Set(campuses.map((campus) => campus.state)).size;

  const cards = universities
    .map((university) => renderUniversityCard(university, campusesByUniversity.get(university.id) ?? []))
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>myuni-api</title>
  <style>
    :root {
      color-scheme: light dark;
      --accent: #2563eb;
      --accent-soft: #eff4ff;
      --bg: #f7f8fa;
      --surface: #ffffff;
      --border: #e2e5ea;
      --text: #1c1f26;
      --text-muted: #5b6270;
      --code-bg: rgba(37, 99, 235, 0.08);
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --accent: #6ea8fe;
        --accent-soft: rgba(110, 168, 254, 0.12);
        --bg: #0f1115;
        --surface: #171a21;
        --border: #2a2e37;
        --text: #e7e9ee;
        --text-muted: #9aa1ad;
        --code-bg: rgba(110, 168, 254, 0.12);
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.4);
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0 1.5rem 4rem;
      line-height: 1.5;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
    }
    header {
      padding: 3.5rem 0 2rem;
    }
    h1 {
      margin: 0 0 0.4rem;
      font-size: 2.25rem;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: var(--text-muted);
      margin: 0 0 1.5rem;
      font-size: 1.05rem;
      max-width: 60ch;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin: 0;
    }
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
    .links a:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .links a.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      margin: 2rem 0;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem 1.1rem;
      box-shadow: var(--shadow);
    }
    .stat .value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--accent);
      display: block;
    }
    .stat .label {
      color: var(--text-muted);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    section h2 {
      font-size: 1.35rem;
      margin: 2.5rem 0 1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.25rem 1.4rem 1.4rem;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .card h3 {
      margin: 0;
      font-size: 1.1rem;
    }
    .short-name {
      margin: 0.15rem 0 0;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    .badge {
      flex-shrink: 0;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      padding: 0.25rem 0.55rem;
      border-radius: 6px;
      white-space: nowrap;
    }
    .badge-ipta {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .badge-ipts {
      background: rgba(140, 100, 220, 0.12);
      color: #8c64dc;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem 1rem;
      margin: 0;
      font-size: 0.85rem;
    }
    .meta dt {
      color: var(--text-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .meta dd {
      margin: 0.1rem 0 0;
      overflow-wrap: anywhere;
    }
    .meta a {
      color: var(--accent);
    }
    details.campuses {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.5rem 0.75rem;
      background: var(--bg);
    }
    details.campuses summary {
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
      padding: 0.3rem 0.1rem;
    }
    .no-campuses {
      color: var(--text-muted);
      font-size: 0.85rem;
      font-style: italic;
      margin: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-top: 0.5rem;
      font-size: 0.85rem;
    }
    th, td {
      text-align: left;
      padding: 0.45rem 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    th {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-muted);
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .campus-link {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }
    .campus-link:hover {
      color: var(--accent);
    }
    code {
      background: var(--code-bg);
      color: var(--accent);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85em;
    }
    .api-link {
      align-self: flex-start;
      text-decoration: none;
      margin-top: auto;
    }
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    footer a {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>myuni-api</h1>
      <p class="subtitle">Open-source REST API for Malaysian university and campus data (public &amp; private institutions).</p>
      <p class="links">
        <a class="primary" href="/docs">API docs</a>
        <a href="/health">Health check</a>
        <a href="/api/universities"><code>/api/universities</code></a>
        <a href="/api/campuses"><code>/api/campuses</code></a>
      </p>
      <div class="stats">
        <div class="stat">
          <span class="value">${universities.length}</span>
          <span class="label">Universities</span>
        </div>
        <div class="stat">
          <span class="value">${campuses.length}</span>
          <span class="label">Campuses</span>
        </div>
        <div class="stat">
          <span class="value">${stateCount}</span>
          <span class="label">States covered</span>
        </div>
      </div>
    </header>
    <section>
      <h2>Universities &amp; campuses</h2>
      <div class="grid">${cards}
      </div>
    </section>
    <footer>
      Data is community-maintained and MIT-licensed. See <a href="/docs">API docs</a> for full endpoint reference and query filters.
    </footer>
  </main>
</body>
</html>`;

  res.type('html').send(html);
}
