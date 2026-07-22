import { loadData } from './data-loader.service.js';
import type { University } from '../schemas/university.schema.js';
import type { Campus } from '../schemas/campus.schema.js';
import type { UniversityQuery } from '../schemas/query.schema.js';

export interface UniversityWithCampuses extends University {
  campuses: Campus[];
}

function matchesFilters(
  university: University,
  filters: Pick<UniversityQuery, 'category' | 'search' | 'state'>,
  campusesByUniversity: Map<string, Campus[]>,
): boolean {
  if (filters.category && university.category !== filters.category) {
    return false;
  }

  if (filters.state) {
    const campuses = campusesByUniversity.get(university.id) ?? [];
    if (!campuses.some((campus) => campus.state === filters.state)) {
      return false;
    }
  }

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${university.name} ${university.short_name}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  return true;
}

export function findUniversities(
  filters: Pick<UniversityQuery, 'category' | 'search' | 'state'>,
): University[] {
  const { universities, campuses } = loadData();

  const campusesByUniversity = new Map<string, Campus[]>();
  for (const campus of campuses) {
    const list = campusesByUniversity.get(campus.university_id) ?? [];
    list.push(campus);
    campusesByUniversity.set(campus.university_id, list);
  }

  return universities.filter((university) =>
    matchesFilters(university, filters, campusesByUniversity),
  );
}

export function findUniversityById(id: string): University | undefined {
  const { universities } = loadData();
  return universities.find((university) => university.id === id);
}

export function findUniversityWithCampuses(id: string): UniversityWithCampuses | undefined {
  const university = findUniversityById(id);
  if (!university) {
    return undefined;
  }

  const { campuses } = loadData();
  return {
    ...university,
    campuses: campuses.filter((campus) => campus.university_id === id),
  };
}
