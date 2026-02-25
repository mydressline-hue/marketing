/**
 * Express Application Setup.
 *
 * Creates and configures the Express application with all middleware, routes,
 * and error handlers. Exported separately from the server start so that
 * tests can import the app without binding to a port.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimitMiddleware,
  hppMiddleware,
  compressionMiddleware,
  requestIdMiddleware,
} from './middleware/security';
import { requestLogger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Route imports
import authRoutes from './routes/auth.routes';
import campaignsRoutes from './routes/campaigns.routes';
import countriesRoutes from './routes/countries.routes';
import creativesRoutes from './routes/creatives.routes';
import productsRoutes from './routes/products.routes';
import contentRoutes from './routes/content.routes';
import alertsRoutes from './routes/alerts.routes';
import settingsRoutes from './routes/settings.routes';
import budgetRoutes from './routes/budget.routes';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();

// ── Global middleware ──────────────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(corsMiddleware);
app.use(helmetMiddleware);
app.use(compressionMiddleware);
app.use(hppMiddleware);
app.use(rateLimitMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────
const prefix = env.API_PREFIX;

app.use(`${prefix}/auth`, authRoutes);
app.use(`${prefix}/campaigns`, campaignsRoutes);
app.use(`${prefix}/countries`, countriesRoutes);
app.use(`${prefix}/creatives`, creativesRoutes);
app.use(`${prefix}/products`, productsRoutes);
app.use(`${prefix}/content`, contentRoutes);
app.use(`${prefix}/alerts`, alertsRoutes);
app.use(`${prefix}/settings`, settingsRoutes);
app.use(`${prefix}/budget`, budgetRoutes);

// ── Error handling ────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
