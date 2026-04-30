import { Router } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { authMiddleware, handleIngest } from './ingest.js';

const log = pino({ name: 'remarkable' });
const router = Router();
router.use(authMiddleware);

const schema = z.object({
  content: z.string().min(1),
  notebook: z.string().optional(),
  page: z.string().optional(),
  capturedAt: z.string().optional(),
});

router.post('/', (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', issues: parsed.error.issues });
  }
  res.status(202).json({ accepted: true });
  handleIngest({
    source: 'remarkable',
    content: parsed.data.content,
    metadata: {
      notebook: parsed.data.notebook,
      page: parsed.data.page,
      capturedAt: parsed.data.capturedAt,
    },
  }).catch((err) => log.error({ err }, 'remarkable ingest failed'));
});

export default router;
