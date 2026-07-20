import { describe, expect, it } from 'vitest';
import { loadData } from '../src/services/data-loader.service.js';

describe('loadData', () => {
  it('loads and validates all sample universities and campuses', () => {
    const { universities, campuses } = loadData(true);

    expect(universities.length).toBeGreaterThan(0);
    expect(campuses.length).toBeGreaterThan(0);
  });

  it('every campus references an existing university', () => {
    const { universities, campuses } = loadData();
    const universityIds = new Set(universities.map((u) => u.id));

    for (const campus of campuses) {
      expect(universityIds.has(campus.university_id)).toBe(true);
    }
  });

  it('has no duplicate ids within universities or campuses', () => {
    const { universities, campuses } = loadData();

    expect(new Set(universities.map((u) => u.id)).size).toBe(universities.length);
    expect(new Set(campuses.map((c) => c.id)).size).toBe(campuses.length);
  });
});
