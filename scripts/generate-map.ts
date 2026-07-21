/**
 * Regenerates src/utils/malaysia-map.ts from DOSM's state-boundary GeoJSON.
 *
 * Usage: npx tsx scripts/generate-map.ts [path-to-geojson]
 *
 * Without an argument it downloads the boundaries from DOSM open data.
 * The output module contains simplified Mercator-projected SVG paths for
 * each state plus a projectToMap() helper used to place campus markers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GEOJSON_URL =
  'https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/geodata/administrative_1_state.geojson';

const OUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'utils',
  'malaysia-map.ts',
);

const BORNEO = new Set(['Sabah', 'Sarawak', 'W.P. Labuan']);
const DESIRED_GAP_DEG = 1.4; // sea gap kept between the Peninsula and Borneo
const WIDTH = 1000;
const TOL = 0.5; // Douglas-Peucker tolerance in viewBox units
const MIN_AREA = 3; // drop islets smaller than this (viewBox units²)

type Ring = [number, number][];

interface StateFeature {
  properties: { state: string };
  geometry: { type: 'MultiPolygon'; coordinates: Ring[][] };
}

async function loadGeojson(): Promise<{ features: StateFeature[] }> {
  const localPath = process.argv[2];
  if (localPath) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  console.log(`Downloading ${GEOJSON_URL} ...`);
  const res = await fetch(GEOJSON_URL);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { features: StateFeature[] };
}

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points: Ring, tol: number): Ring {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i]!, a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [a, b];
  const left = simplify(points.slice(0, idx + 1), tol);
  const right = simplify(points.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

function ringArea(pts: Ring): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
}

async function main(): Promise<void> {
  const geo = await loadGeojson();

  // Find longitudinal extents to compress the South China Sea gap.
  let penMaxLon = -Infinity;
  let borneoMinLon = Infinity;
  for (const f of geo.features) {
    const isBorneo = BORNEO.has(f.properties.state);
    for (const poly of f.geometry.coordinates)
      for (const ring of poly)
        for (const [lon] of ring) {
          if (isBorneo) borneoMinLon = Math.min(borneoMinLon, lon);
          else penMaxLon = Math.max(penMaxLon, lon);
        }
  }
  const gapShift = +(borneoMinLon - penMaxLon - DESIRED_GAP_DEG).toFixed(4);
  const gapLon = +((penMaxLon + borneoMinLon) / 2).toFixed(4);

  const mercator = (lon: number, lat: number): [number, number] => {
    const lonAdj = lon >= gapLon ? lon - gapShift : lon;
    const x = (lonAdj * Math.PI) / 180;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    return [x, -y]; // flip y for SVG
  };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of geo.features)
    for (const poly of f.geometry.coordinates)
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          const [x, y] = mercator(lon, lat);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }

  const scale = WIDTH / (maxX - minX);
  const height = +((maxY - minY) * scale).toFixed(1);
  const project = (lon: number, lat: number): [number, number] => {
    const [x, y] = mercator(lon, lat);
    return [(x - minX) * scale, (y - minY) * scale];
  };

  const statePaths: Record<string, string> = {};
  const stateCentroids: Record<string, [number, number]> = {};

  for (const f of geo.features) {
    const polys = f.geometry.coordinates.map((poly) =>
      poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat)) as Ring),
    );

    let largest: Ring[] = polys[0]!;
    let largestArea = -1;
    for (const rings of polys) {
      const area = ringArea(rings[0]!);
      if (area > largestArea) {
        largestArea = area;
        largest = rings;
      }
    }
    const kept = polys.filter((rings) => ringArea(rings[0]!) >= MIN_AREA);
    if (kept.length === 0) kept.push(largest);

    const d: string[] = [];
    for (const rings of kept) {
      for (const [ri, ring] of rings.entries()) {
        if (ri > 0 && ringArea(ring) < MIN_AREA) continue; // tiny holes
        let simplified = simplify(ring, TOL);
        if (simplified.length < 4) simplified = simplify(ring, TOL / 4);
        if (simplified.length < 4) continue;
        const cmds = simplified
          .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
          .join('');
        d.push(cmds + 'Z');
      }
    }
    statePaths[f.properties.state] = d.join('');

    const ring = largest[0]!;
    let cx = 0;
    let cy = 0;
    let aSum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      const cross = x1 * y2 - x2 * y1;
      aSum += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    stateCentroids[f.properties.state] = [+(cx / (3 * aSum)).toFixed(1), +(cy / (3 * aSum)).toFixed(1)];
  }

  const ts = `// AUTO-GENERATED — do not edit by hand.
// Source: DOSM (Department of Statistics Malaysia) open data,
// administrative_1_state.geojson, simplified and Mercator-projected.
// Regenerate with: npx tsx scripts/generate-map.ts
import type { MalaysianState } from '../schemas/common.schema.js';

export const MAP_WIDTH = ${WIDTH};
export const MAP_HEIGHT = ${height};
export const MAP_VIEWBOX = '0 0 ${WIDTH} ${height}';

/** Simplified SVG path outline for each state, in viewBox coordinates. */
export const STATE_PATHS: Record<MalaysianState, string> = ${JSON.stringify(statePaths, null, 2)};

/** Visual centre of each state's largest landmass, in viewBox coordinates. */
export const STATE_CENTROIDS: Record<MalaysianState, readonly [number, number]> = ${JSON.stringify(stateCentroids, null, 2)};

const GAP_LON = ${gapLon};
const GAP_SHIFT = ${gapShift};
const MIN_X = ${minX};
const MIN_Y = ${minY};
const SCALE = ${scale};

/**
 * Projects WGS84 coordinates into the map's viewBox space using the same
 * Mercator projection (with the South China Sea gap compressed) that
 * generated STATE_PATHS. Used to place campus markers.
 */
export function projectToMap(longitude: number, latitude: number): { x: number; y: number } {
  const lonAdj = longitude >= GAP_LON ? longitude - GAP_SHIFT : longitude;
  const x = (lonAdj * Math.PI) / 180;
  const y = -Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  return {
    x: Number(((x - MIN_X) * SCALE).toFixed(1)),
    y: Number(((y - MIN_Y) * SCALE).toFixed(1)),
  };
}
`;

  fs.writeFileSync(OUT_PATH, ts);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
