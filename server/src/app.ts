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
import agentsRoutes from './routes/agents.routes';
import killswitchRoutes from './routes/killswitch.routes';
import infrastructureRoutes from './routes/infrastructure.routes';
import advancedAiRoutes from './routes/advanced-ai.routes';
import integrationsRoutes from './routes/integrations.routes';
import healthcheckRoutes from './routes/healthcheck.routes';
import webhooksRoutes from './routes/webhooks.routes';
import queueRoutes from './routes/queue.routes';
import ratelimitRoutes from './routes/ratelimit.routes';
import dashboardRoutes from './routes/dashboard.routes';
import notificationsRoutes from './routes/notifications.routes';
import auditRoutes from './routes/audit.routes';
import apikeysRoutes from './routes/apikeys.routes';
import finalOutputsRoutes from './routes/final-outputs.routes';
import finalOutputsStrategyRoutes from './routes/final-outputs-strategy.routes';
import finalOutputsChannelsRoutes from './routes/final-outputs-channels.routes';
import finalOutputsRoadmapRoutes from './routes/final-outputs-roadmap.routes';
import finalOutputsValidationRoutes from './routes/final-outputs-validation.routes';

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
app.use('/health', healthcheckRoutes);

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
app.use(`${prefix}/agents`, agentsRoutes);
app.use(prefix, killswitchRoutes);
app.use(`${prefix}/infrastructure`, infrastructureRoutes);
app.use(`${prefix}/advanced-ai`, advancedAiRoutes);
app.use(`${prefix}/integrations`, integrationsRoutes);
app.use(`${prefix}/webhooks`, webhooksRoutes);
app.use(`${prefix}/queue`, queueRoutes);
app.use(`${prefix}/ratelimits`, ratelimitRoutes);
app.use(`${prefix}/dashboard`, dashboardRoutes);
app.use(`${prefix}/notifications`, notificationsRoutes);
app.use(`${prefix}/audit`, auditRoutes);
app.use(`${prefix}/apikeys`, apikeysRoutes);
app.use(`${prefix}/final-outputs`, finalOutputsRoutes);
app.use(`${prefix}/final-outputs`, finalOutputsStrategyRoutes);
app.use(`${prefix}/final-outputs/channel-allocation`, finalOutputsChannelsRoutes);
app.use(`${prefix}/final-outputs`, finalOutputsRoadmapRoutes);
app.use(`${prefix}/final-outputs`, finalOutputsValidationRoutes);

// ── Error handling ────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
