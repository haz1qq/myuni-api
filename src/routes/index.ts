import { Router } from 'express';
import { universityRouter } from './university.routes.js';
import { campusRouter } from './campus.routes.js';

export const apiRouter = Router();

apiRouter.use('/universities', universityRouter);
apiRouter.use('/campuses', campusRouter);
