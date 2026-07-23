import rateLimit from 'express-rate-limit';

/* 300 requests / 15 min per IP is generous enough to page through the full
   university list (450 records, 20/page) many times over, while still
   capping runaway scripts and scrapers. Disabled in tests so the shared
   supertest `app` instance (reused across many `it` blocks) never trips it. */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later.',
      },
    });
  },
});
