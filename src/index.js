import express from 'express';
import pino from 'pino';
import { config } from './config.js';
// Importing db.js runs migrations as a side effect (idempotent).
import './db.js';
import ingestRouter from './routes/ingest.js';
import plaudRouter from './routes/plaud.js';
import remarkableRouter from './routes/remarkable.js';
import shortcutRouter from './routes/shortcut.js';
import summaryRouter from './routes/summary.js';
import dashboardRouter from './routes/dashboard.js';
import captureRouter from './routes/capture.js';
import { scheduleDailySummary } from './jobs/dailySummary.js';

const log = pino({ level: config.LOG_LEVEL, name: 'app' });

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Order matters — more specific routes first so they don't fall through to /ingest.
app.use('/ingest/plaud', plaudRouter);
app.use('/ingest/remarkable', remarkableRouter);
app.use('/ingest/shortcut', shortcutRouter);
app.use('/ingest', ingestRouter);
app.use('/summary', summaryRouter);
app.use('/dashboard', dashboardRouter);
app.use('/capture', captureRouter);

app.use((err, _req, res, _next) => {
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal' });
});

app.listen(config.PORT, () => {
  log.info(`AI Brain listening on :${config.PORT}`);
  scheduleDailySummary();
});
