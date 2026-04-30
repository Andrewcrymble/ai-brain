import { Router } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { authMiddleware, handleIngest } from './ingest.js';

const log = pino({ name: 'plaud' });
const router = Router();
router.use(authMiddleware);

const schema = z.object({
  subject: z.string().optional().default(''),
  body: z.string().min(1),
  from: z.string().optional(),
  receivedAt: z.string().optional(),
});

const SIGNATURE_MARKERS = [
  /^--\s*$/m,
  /^\s*Sent from my (iPhone|iPad|Android|Plaud)/im,
  /^On .+ wrote:$/m,
  /^From: .+\nSent: /m,
  /^_{5,}/m,
  /^Get Outlook for /im,
];

function cleanEmail(body) {
  let cleaned = body;
  for (const marker of SIGNATURE_MARKERS) {
    const match = cleaned.match(marker);
    if (match && match.index !== undefined) {
      cleaned = cleaned.slice(0, match.index);
    }
  }
  return cleaned.trim();
}

router.post('/', (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', issues: parsed.error.issues });
  }
  const { subject, body, from, receivedAt } = parsed.data;
  const content = cleanEmail(body);

  // Ack quickly — the email forwarder doesn't care about the response.
  res.status(202).json({ accepted: true });

  handleIngest({
    source: 'plaud',
    content,
    metadata: { subject, from, receivedAt },
  }).catch((err) => log.error({ err }, 'plaud ingest failed'));
});

export default router;
