import { z } from 'zod';
import { stateSchema } from './common.schema.js';
import { universityCategorySchema } from './university.schema.js';

// max: 1000 comfortably covers the full dataset (586 universities, 670
// campuses as of writing) in a single request, so ?limit=1000 actually works
// instead of erroring -- see landing.controller.ts stats card for current
// counts. Default stays at 20 so an unqualified request stays a small page.
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(20),
});

export const universityQuerySchema = paginationQuerySchema.extend({
  category: universityCategorySchema.optional(),
  state: stateSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export const campusQuerySchema = paginationQuerySchema.extend({
  state: stateSchema.optional(),
  university_id: z.string().trim().min(1).optional(),
});

export type UniversityQuery = z.infer<typeof universityQuerySchema>;
export type CampusQuery = z.infer<typeof campusQuerySchema>;
