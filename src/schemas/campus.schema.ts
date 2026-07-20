import { z } from 'zod';
import { stateSchema } from './common.schema.js';

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const campusSchema = z.object({
  id: z
    .string()
    .regex(idPattern, 'id must be lowercase kebab-case (e.g. "uitm-shah-alam")'),
  university_id: z
    .string()
    .regex(idPattern, 'university_id must be lowercase kebab-case (e.g. "uitm")'),
  name: z.string().min(1),
  state: stateSchema,
  city: z.string().min(1),
  postcode: z.string().regex(/^\d{5}$/, 'postcode must be a 5-digit Malaysian postcode'),
  address: z.string().min(1),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export type Campus = z.infer<typeof campusSchema>;
