import { Router } from 'express';
import authRoutes from './auth.routes';
import countriesRoutes from './countries.routes';
import campaignsRoutes from './campaigns.routes';
import creativesRoutes from './creatives.routes';
import contentRoutes from './content.routes';
import productsRoutes from './products.routes';
import budgetRoutes from './budget.routes';
import alertsRoutes from './alerts.routes';
import settingsRoutes from './settings.routes';
import agentsRoutes from './agents.routes';
import killswitchRoutes from './killswitch.routes';
import infrastructureRoutes from './infrastructure.routes';
import auditRoutes from './audit.routes';
import dashboardRoutes from './dashboard.routes';
import webhooksRoutes from './webhooks.routes';
import queueRoutes from './queue.routes';
import ratelimitRoutes from './ratelimit.routes';
import notificationsRoutes from './notifications.routes';
import apikeysRoutes from './apikeys.routes';
import finalOutputsBudgetRoutes from './final-outputs-budget.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/countries', countriesRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/creatives', creativesRoutes);
router.use('/content', contentRoutes);
router.use('/products', productsRoutes);
router.use('/budget', budgetRoutes);
router.use('/alerts', alertsRoutes);
router.use('/settings', settingsRoutes);
router.use('/agents', agentsRoutes);
router.use('/killswitch', killswitchRoutes);
router.use('/infrastructure', infrastructureRoutes);
router.use('/audit', auditRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/queue', queueRoutes);
router.use('/ratelimits', ratelimitRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/apikeys', apikeysRoutes);
router.use('/final-outputs/budget-model', finalOutputsBudgetRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
