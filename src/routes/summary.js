import { Router } from 'express';
import pino from 'pino';
import { authMiddleware } from './ingest.js';
import { buildAndSendDailySummary } from '../jobs/dailySummary.js';

const log = pino({ name: 'summary' });
const router = Router();
router.use(authMiddleware);

/**
 * Manually trigger today's briefing. By default also posts to WhatsApp.
 * Pass ?dry=1 to build the message without sending.
 */
router.get('/today', async (req, res) => {
  try {
    const skipWhatsapp = req.query.dry === '1';
    const result = await buildAndSendDailySummary({ skipWhatsapp });
    res.json(result);
  } catch (err) {
    log.error({ err }, 'summary build failed');
    res.status(500).json({ error: err.message });
  }
});

export default router;
