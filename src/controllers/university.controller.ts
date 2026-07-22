import type { Request, Response } from 'express';
import { universityQuerySchema } from '../schemas/query.schema.js';
import { findUniversities, findUniversityWithCampuses } from '../services/university.service.js';
import { paginate } from '../utils/paginate.js';
import { ApiError } from '../utils/api-error.js';

export function listUniversities(req: Request, res: Response): void {
  const query = universityQuerySchema.parse(req.query);
  const universities = findUniversities({
    category: query.category,
    state: query.state,
    search: query.search,
  });
  const result = paginate(universities, query.page, query.limit);
  res.json(result);
}

export function getUniversity(req: Request, res: Response): void {
  const { id } = req.params as { id: string };
  const university = findUniversityWithCampuses(id);

  if (!university) {
    throw ApiError.notFound(`University "${id}" not found`);
  }

  res.json({ data: university });
}
