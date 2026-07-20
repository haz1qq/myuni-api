import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes/index.js';
import { swaggerSpec } from './docs/swagger.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('dev', { skip: () => process.env.NODE_ENV === 'test' }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use('/api', (req, _res, next) => {
    const [pathPart, queryPart] = req.url.split('?');
    if (pathPart?.endsWith('.json')) {
      req.url = pathPart.slice(0, -'.json'.length) + (queryPart ? `?${queryPart}` : '');
    }
    next();
  });
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
