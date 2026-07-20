import type { Request, Response } from 'express';
import { campusQuerySchema } from '../schemas/query.schema.js';
import { findCampusById, findCampuses } from '../services/campus.service.js';
import { paginate } from '../utils/paginate.js';
import { ApiError } from '../utils/api-error.js';

export function listCampuses(req: Request, res: Response): void {
  const query = campusQuerySchema.parse(req.query);
  const campuses = findCampuses({ state: query.state, university_id: query.university_id });
  const result = paginate(campuses, query.page, query.limit);
  res.json(result);
}

export function getCampus(req: Request, res: Response): void {
  const { id } = req.params as { id: string };
  const campus = findCampusById(id);

  if (!campus) {
    throw ApiError.notFound(`Campus "${id}" not found`);
  }

  res.json({ data: campus });
}
