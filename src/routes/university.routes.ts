import { Router } from 'express';
import { getUniversity, listUniversities } from '../controllers/university.controller.js';

export const universityRouter = Router();

/**
 * @openapi
 * /university:
 *   get:
 *     summary: List universities
 *     tags: [Universities]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [IPTA, IPTS, Polytechnic, Community College, MARA College] }
 *         description: Filter by institution category
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter to universities with at least one campus in this Malaysian state
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search over name and short_name
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: A paginated list of universities
 */
universityRouter.get('/', listUniversities);

/**
 * @openapi
 * /university/{id}:
 *   get:
 *     summary: Get a university by id, including its campuses
 *     tags: [Universities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: uitm
 *     responses:
 *       200:
 *         description: The university, with an embedded campuses array
 *       404:
 *         description: University not found
 */
universityRouter.get('/:id', getUniversity);
