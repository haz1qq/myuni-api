import { describe, expect, it } from 'vitest';
import { universitySchema } from '../src/schemas/university.schema.js';
import { campusSchema } from '../src/schemas/campus.schema.js';

describe('universitySchema', () => {
  it('accepts a valid university record', () => {
    const result = universitySchema.safeParse({
      id: 'uitm',
      name: 'Universiti Teknologi MARA',
      short_name: 'UiTM',
      category: 'IPTA',
      website: 'https://www.uitm.edu.my',
      student_email_domains: ['@student.uitm.edu.my', '@isiswa.uitm.edu.my'],
      established: 1956,
      student_range: '170000+',
    });

    expect(result.success).toBe(true);
  });

  it('defaults student email domains to null when they are unknown', () => {
    const result = universitySchema.safeParse({
      id: 'example-college',
      name: 'Example College',
      short_name: 'EC',
      category: 'IPTS',
      website: null,
      established: null,
      student_range: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.student_email_domains).toBeNull();
    }
  });

  it('rejects malformed student email domains', () => {
    const result = universitySchema.safeParse({
      id: 'uitm',
      name: 'Universiti Teknologi MARA',
      short_name: 'UiTM',
      category: 'IPTA',
      website: 'https://www.uitm.edu.my',
      student_email_domains: ['student.uitm.edu.my'],
      established: 1956,
      student_range: '170000+',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = universitySchema.safeParse({
      id: 'uitm',
      name: 'Universiti Teknologi MARA',
      short_name: 'UiTM',
      category: 'PUBLIC',
      website: 'https://www.uitm.edu.my',
      established: 1956,
      student_range: '170000+',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-kebab-case id', () => {
    const result = universitySchema.safeParse({
      id: 'UiTM',
      name: 'Universiti Teknologi MARA',
      short_name: 'UiTM',
      category: 'IPTA',
      website: 'https://www.uitm.edu.my',
      established: 1956,
      student_range: '170000+',
    });

    expect(result.success).toBe(false);
  });
});

describe('campusSchema', () => {
  const valid = {
    id: 'uitm-shah-alam',
    university_id: 'uitm',
    name: 'Shah Alam Campus',
    state: 'Selangor',
    city: 'Shah Alam',
    postcode: '40450',
    address: 'Universiti Teknologi MARA, 40450 Shah Alam, Selangor',
    latitude: 3.0738,
    longitude: 101.4998,
  };

  it('accepts a valid campus record', () => {
    expect(campusSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an unknown state', () => {
    expect(campusSchema.safeParse({ ...valid, state: 'Atlantis' }).success).toBe(false);
  });

  it('rejects a malformed postcode', () => {
    expect(campusSchema.safeParse({ ...valid, postcode: '404' }).success).toBe(false);
  });
});
