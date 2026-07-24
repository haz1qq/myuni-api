import { Router } from 'express';
import { getCampus, listCampuses } from '../controllers/campus.controller.js';

export const campusRouter = Router();

/**
 * @openapi
 * /campus:
 *   get:
 *     summary: List campuses
 *     tags: [Campuses]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *         description: Filter by Malaysian state
 *       - in: query
 *         name: university_id
 *         schema: { type: string }
 *         description: Filter by parent university id
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 1000 }
 *     responses:
 *       200:
 *         description: A paginated list of campuses
 */
campusRouter.get('/', listCampuses);

/**
 * @openapi
 * /campus/{id}:
 *   get:
 *     summary: Get a campus by id
 *     tags: [Campuses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: uitm-shah-alam
 *     responses:
 *       200:
 *         description: The campus
 *       404:
 *         description: Campus not found
 */
campusRouter.get('/:id', getCampus);
