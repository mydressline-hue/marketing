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

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
