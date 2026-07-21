import express, { type Express, type RequestHandler } from 'express';
import cors from 'cors';
import helmetImport from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes/index.js';
import { swaggerSpec } from './docs/swagger.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { renderLanding, serveLandingScript } from './controllers/landing.controller.js';


type HelmetFactory = (options?: Record<string, unknown>) => RequestHandler;
const helmet = helmetImport as unknown as HelmetFactory;

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('dev', { skip: () => process.env.NODE_ENV === 'test' }));
  app.use(express.json());
  app.use(express.static('public'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/', renderLanding);
  app.get('/landing.js', serveLandingScript);

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