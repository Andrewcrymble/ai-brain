import { Router } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { authMiddleware, handleIngest } from './ingest.js';

const log = pino({ name: 'shortcut' });
const router = Router();
router.use(authMiddleware);

const schema = z.object({
  text: z.string().min(1),
  context: z.record(z.any()).optional(),
});

router.post('/', (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', issues: parsed.error.issues });
  }
  res.status(202).json({ accepted: true });
  handleIngest({
    source: 'shortcut',
    content: parsed.data.text,
    metadata: parsed.data.context ?? {},
  }).catch((err) => log.error({ err }, 'shortcut ingest failed'));
});

export default router;
