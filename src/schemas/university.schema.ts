import { z } from 'zod';

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const universityCategorySchema = z.enum(['IPTA', 'IPTS']);

export const universitySchema = z.object({
  id: z
    .string()
    .regex(idPattern, 'id must be lowercase kebab-case (e.g. "uitm")'),
  name: z.string().min(1),
  short_name: z.string().min(1),
  category: universityCategorySchema,
  website: z.string().url(),
  established: z
    .number()
    .int()
    .gte(1900)
    .lte(new Date().getFullYear()),
  student_range: z.string().min(1),
  logo: z
    .string()
    .regex(
      /^\/logos\/[a-z0-9]+(-[a-z0-9]+)*\.(png|svg|webp|jpe?g)$/,
      'logo must be a path like "/logos/uitm.png" (file lives in public/logos/)',
    )
    .optional(),
  description: z.string().optional(),
});

export type University = z.infer<typeof universitySchema>;
export type UniversityCategory = z.infer<typeof universityCategorySchema>;
