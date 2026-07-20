import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/universities', () => {
  it('returns a paginated list of universities', async () => {
    const res = await request(app).get('/api/universities');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/universities').query({ category: 'IPTS' });

    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { category: string }) => u.category === 'IPTS')).toBe(true);
  });

  it('filters by search term, case-insensitively', async () => {
    const res = await request(app).get('/api/universities').query({ search: 'teknologi mara' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('uitm');
  });

  it('rejects an invalid category', async () => {
    const res = await request(app).get('/api/universities').query({ category: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid request');
  });
});

describe('GET /api/universities/:id', () => {
  it('returns a university with its embedded campuses', async () => {
    const res = await request(app).get('/api/universities/uitm');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('uitm');
    expect(res.body.data.campuses.length).toBeGreaterThan(0);
    expect(res.body.data.campuses.every((c: { university_id: string }) => c.university_id === 'uitm')).toBe(
      true,
    );
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/universities/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });
});
