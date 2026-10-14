import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { readConfig } from './config/env.js';
import { createItemsRouter } from './features/items/items.routes.js';
import { requestContext } from './middleware/request-context.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './shared/app-error.js';
import { writeLog } from './shared/logger.js';

export function createApp({ config = readConfig(), logger = writeLog } = {}) {
  const app = express();
  app.set('env', config.nodeEnv);
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.use(requestContext(logger));
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: ['X-Request-Id', 'Location'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: config.jsonBodyLimit, inflate: false }));
  app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });
  app.use('/api/v1/items', createItemsRouter());
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
