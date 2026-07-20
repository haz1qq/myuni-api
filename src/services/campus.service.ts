import { loadData } from './data-loader.service.js';
import type { Campus } from '../schemas/campus.schema.js';
import type { CampusQuery } from '../schemas/query.schema.js';

function matchesFilters(
  campus: Campus,
  filters: Pick<CampusQuery, 'state' | 'university_id'>,
): boolean {
  if (filters.state && campus.state !== filters.state) {
    return false;
  }

  if (filters.university_id && campus.university_id !== filters.university_id) {
    return false;
  }

  return true;
}

export function findCampuses(filters: Pick<CampusQuery, 'state' | 'university_id'>): Campus[] {
  const { campuses } = loadData();
  return campuses.filter((campus) => matchesFilters(campus, filters));
}

export function findCampusById(id: string): Campus | undefined {
  const { campuses } = loadData();
  return campuses.find((campus) => campus.id === id);
}
