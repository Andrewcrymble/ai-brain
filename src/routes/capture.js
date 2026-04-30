import express, { Router } from 'express';
import { config } from '../config.js';
import { handleIngest } from './ingest.js';
import pino from 'pino';

const log = pino({ name: 'capture' });
const router = Router();

router.use((req, res, next) => {
  const supplied = req.query.token || req.body?.token || req.get('X-Brain-Token');
  if (supplied !== config.INGEST_TOKEN) {
    return res.status(401).type('text/plain').send('unauthorized');
  }
  next();
});

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  :root {
    --bg: #fafaf8; --fg: #1a1a1a; --muted: #8a8a8a; --border: #e2e2dd;
    --card: #fff; --accent: #2563eb;
    --ok: #166534; --ok-bg: #dcfce7; --err: #991b1b; --err-bg: #fee2e2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f0f; --fg: #e8e8e8; --muted: #888; --border: #2a2a2a;
      --card: #161616; --accent: #60a5fa;
      --ok: #4ade80; --ok-bg: #052e16; --err: #f87171; --err-bg: #450a0a;
    }
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--fg); margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    padding: 20px; max-width: 640px; margin: 0 auto; line-height: 1.5;
    -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  textarea {
    width: 100%; min-height: 200px; padding: 14px;
    font-size: 17px; line-height: 1.45;
    background: var(--card); color: var(--fg);
    border: 1px solid var(--border); border-radius: 10px;
    resize: vertical;
    font-family: inherit;
  }
  textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
  .row { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
  button {
    background: var(--accent); color: #fff; border: none;
    font-size: 17px; font-weight: 600;
    padding: 14px 24px; border-radius: 10px;
    cursor: pointer; flex: 1;
    -webkit-tap-highlight-color: transparent;
  }
  button:active { transform: scale(0.98); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary {
    background: transparent; color: var(--accent);
    border: 1px solid var(--border);
  }
  .result { margin-top: 24px; }
  .result-card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px;
  }
  .result h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
  .summary { font-size: 16px; font-weight: 500; margin-bottom: 14px; }
  .actions-list { list-style: none; padding: 0; margin: 0; }
  .actions-list li { padding: 8px 0; border-top: 1px solid var(--border); font-size: 14px; }
  .actions-list li:first-child { border-top: none; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 6px; }
  .badge.ok { background: var(--ok-bg); color: var(--ok); }
  .badge.err { background: var(--err-bg); color: var(--err); }
  .badge.type { background: var(--border); color: var(--fg); }
  .err-msg { color: var(--err); font-size: 13px; margin-top: 4px; }
  .duplicate { color: var(--muted); font-style: italic; }
  a { color: var(--accent); }
`;

function renderForm({ token, prefill = '', error = null }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Brain Dump</title>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Brain">
  <meta name="theme-color" content="#fafaf8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0f0f0f" media="(prefers-color-scheme: dark)">
  <style>${STYLES}</style>
</head>
<body>
  <h1>Brain dump</h1>
  <div class="sub">Type or dictate. The brain will turn it into calendar events, tasks, drafts, or notes.</div>
  ${error ? `<div class="err-msg">${escapeHtml(error)}</div>` : ''}
  <form method="POST" action="/capture">
    <input type="hidden" name="token" value="${escapeHtml(token)}">
    <textarea name="text" autofocus placeholder="What's on your mind?" required>${escapeHtml(prefill)}</textarea>
    <div class="row">
      <button type="submit">Send to brain</button>
    </div>
  </form>
  <div class="sub" style="margin-top:24px;">
    <a href="/dashboard?token=${encodeURIComponent(token)}">View dashboard →</a>
  </div>
</body>
</html>`;
}

function renderResult({ token, text, result }) {
  const { summary, actions, duplicate } = result;

  if (duplicate) {
    return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><title>Duplicate · Brain Dump</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${STYLES}</style>
</head><body>
  <h1>Brain dump</h1>
  <div class="sub">Already received — nothing new to do.</div>
  <div class="result-card">
    <div class="duplicate">This input matched something you sent before. No new actions were taken.</div>
  </div>
  <div class="row" style="margin-top:14px;">
    <a href="/capture?token=${encodeURIComponent(token)}"><button type="button">Capture another</button></a>
    <a href="/dashboard?token=${encodeURIComponent(token)}"><button type="button" class="secondary">Dashboard</button></a>
  </div>
</body></html>`;
  }

  const actionItems = (actions ?? []).map((a) => {
    const badge = a.status === 'success'
      ? '<span class="badge ok">success</span>'
      : '<span class="badge err">failed</span>';
    const errMsg = a.error ? `<div class="err-msg">${escapeHtml(a.error)}</div>` : '';
    return `<li>${badge}<span class="badge type">${escapeHtml(a.type)}</span>${errMsg}</li>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><title>Done · Brain Dump</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${STYLES}</style>
</head><body>
  <h1>Brain dump</h1>
  <div class="sub">Captured.</div>
  <div class="result-card">
    <h2>Summary</h2>
    <div class="summary">${escapeHtml(summary || 'no summary')}</div>
    <h2>Actions taken</h2>
    ${actionItems ? `<ul class="actions-list">${actionItems}</ul>` : '<div class="duplicate">No actions — saved as memory only.</div>'}
  </div>
  <div class="row" style="margin-top:14px;">
    <a href="/capture?token=${encodeURIComponent(token)}" style="flex:1;"><button type="button" style="width:100%;">Capture another</button></a>
    <a href="/dashboard?token=${encodeURIComponent(token)}" style="flex:1;"><button type="button" class="secondary" style="width:100%;">Dashboard</button></a>
  </div>
</body></html>`;
}

router.get('/', (req, res) => {
  res.type('text/html').send(renderForm({ token: req.query.token }));
});

router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const text = (req.body?.text ?? '').trim();
  const token = req.body?.token ?? req.query.token ?? '';
  if (!text) {
    return res.type('text/html').send(renderForm({ token, error: 'Empty input' }));
  }
  try {
    const result = await handleIngest({
      source: 'web',
      content: text,
      metadata: { ua: req.get('user-agent') ?? '' },
    });
    res.type('text/html').send(renderResult({ token, text, result }));
  } catch (err) {
    log.error({ err }, 'capture ingest failed');
    res.type('text/html').send(renderForm({ token, prefill: text, error: `Failed: ${err.message}` }));
  }
});

export default router;
