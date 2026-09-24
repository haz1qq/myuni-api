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

  it('loads the researched IPTA student email domains', () => {
    const { universities } = loadData(true);
    const actual = Object.fromEntries(
      universities
        .filter((university) => university.category === 'IPTA')
        .map((university) => [university.id, university.student_email_domains]),
    );

    expect(actual).toEqual({
      iium: ['@student.iium.edu.my', '@live.iium.edu.my'],
      uitm: ['@student.uitm.edu.my', '@isiswa.uitm.edu.my'],
      ukm: ['@siswa.ukm.edu.my'],
      um: ['@siswa.um.edu.my'],
      umk: ['@siswa.umk.edu.my'],
      umpsa: ['@adab.umpsa.edu.my', '@student.umpsa.edu.my'],
      ums: ['@student.ums.edu.my'],
      umt: ['@ocean.umt.edu.my', '@pps.umt.edu.my'],
      unimap: ['@studentmail.unimap.edu.my'],
      unimas: ['@siswa.unimas.my'],
      unisza: ['@putra.unisza.edu.my'],
      upm: ['@student.upm.edu.my'],
      upnm: ['@alfateh.upnm.edu.my'],
      upsi: ['@siswa.upsi.edu.my'],
      usim: ['@raudah.usim.edu.my'],
      usm: ['@student.usm.my'],
      utem: ['@student.utem.edu.my'],
      uthm: ['@student.uthm.edu.my'],
      utm: ['@graduate.utm.my', '@live.utm.my'],
      uum: null,
    });
  });
});
