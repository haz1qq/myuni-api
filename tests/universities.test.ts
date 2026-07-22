import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/university', () => {
  it('returns a paginated list of universities', async () => {
    const res = await request(app).get('/api/university');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/university').query({ category: 'IPTS' });

    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { category: string }) => u.category === 'IPTS')).toBe(true);
  });

  it('filters by search term, case-insensitively', async () => {
    const res = await request(app).get('/api/university').query({ search: 'teknologi mara' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('uitm');
  });

  it('filters by state, matching universities with at least one campus there', async () => {
    const res = await request(app).get('/api/university').query({ state: 'Kedah' });

    expect(res.status).toBe(200);
    expect(res.body.data.some((u: { id: string }) => u.id === 'uum')).toBe(true);
  });

  it('combines state and category filters', async () => {
    const res = await request(app).get('/api/university').query({ state: 'Kedah', category: 'IPTA' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.every((u: { category: string }) => u.category === 'IPTA'),
    ).toBe(true);
  });

  it('rejects an invalid category', async () => {
    const res = await request(app).get('/api/university').query({ category: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid request');
  });

  it('rejects an invalid state', async () => {
    const res = await request(app).get('/api/university').query({ state: 'Atlantis' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid request');
  });
});

describe('GET /api/university/:id', () => {
  it('returns a university with its embedded campuses', async () => {
    const res = await request(app).get('/api/university/uitm');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('uitm');
    expect(res.body.data.campuses.length).toBeGreaterThan(0);
    expect(res.body.data.campuses.every((c: { university_id: string }) => c.university_id === 'uitm')).toBe(
      true,
    );
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/university/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });
});

describe('.json suffix', () => {
  it('is an alternative to the plain list path', async () => {
    const [plain, jsonSuffixed] = await Promise.all([
      request(app).get('/api/university'),
      request(app).get('/api/university.json'),
    ]);

    expect(jsonSuffixed.status).toBe(200);
    expect(jsonSuffixed.body).toEqual(plain.body);
  });

  it('is an alternative to the plain detail path, and still honours query params', async () => {
    const res = await request(app).get('/api/university.json').query({ category: 'IPTS' });

    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { category: string }) => u.category === 'IPTS')).toBe(true);
  });

  it('works on the :id route', async () => {
    const res = await request(app).get('/api/university/uitm.json');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('uitm');
  });
});
