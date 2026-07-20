import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/campuses', () => {
  it('returns a paginated list of campuses', async () => {
    const res = await request(app).get('/api/campuses');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('filters by state', async () => {
    const res = await request(app).get('/api/campuses').query({ state: 'Selangor' });

    expect(res.status).toBe(200);
    expect(res.body.data.every((c: { state: string }) => c.state === 'Selangor')).toBe(true);
  });

  it('filters by university_id', async () => {
    const res = await request(app).get('/api/campuses').query({ university_id: 'uitm' });

    expect(res.status).toBe(200);
    expect(res.body.data.every((c: { university_id: string }) => c.university_id === 'uitm')).toBe(
      true,
    );
  });
});

describe('GET /api/campuses/:id', () => {
  it('returns a single campus', async () => {
    const res = await request(app).get('/api/campuses/uitm-shah-alam');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('uitm-shah-alam');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/campuses/does-not-exist');

    expect(res.status).toBe(404);
  });
});
