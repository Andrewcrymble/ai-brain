import { Router } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { config } from '../config.js';
import { recordInput } from '../lib/memory.js';
import { processInput } from '../claude.js';
import { route } from '../lib/router.js';

const log = pino({ name: 'ingest' });

export function authMiddleware(req, res, next) {
  if (req.get('X-Brain-Token') !== config.INGEST_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

const schema = z.object({
  source: z.string().min(1),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

/**
 * Run an input through the brain end-to-end: store, parse, route.
 * Used directly by the universal /ingest route AND by every webhook route.
 */
export async function handleIngest({ source, content, metadata }) {
  const { id: inputId, duplicate } = recordInput({ source, content, metadata });
  if (duplicate) {
    log.info({ inputId, source }, 'duplicate input ignored');
    return { inputId, duplicate: true, summary: null, actions: [] };
  }
  const brainOutput = await processInput({ source, content, metadata });
  const results = await route({ inputId, brainOutput });
  return {
    inputId,
    duplicate: false,
    summary: brainOutput.summary,
    actions: results,
  };
}

const router = Router();
router.use(authMiddleware);

// Universal endpoint — synchronous, returns full result.
// Useful for testing/debugging via curl or iOS Shortcuts that want the response.
router.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', issues: parsed.error.issues });
  }
  try {
    const result = await handleIngest(parsed.data);
    res.json(result);
  } catch (err) {
    log.error({ err }, 'ingest failed');
    res.status(500).json({ error: err.message });
  }
});

export default router;
