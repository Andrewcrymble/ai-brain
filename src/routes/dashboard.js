import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';

const router = Router();

// Browser-friendly auth: accept token via query string or header.
// Bookmark the URL with ?token=... and you're done.
router.use((req, res, next) => {
  const supplied = req.query.token || req.get('X-Brain-Token');
  if (supplied !== config.INGEST_TOKEN) {
    return res.status(401).type('text/plain').send('unauthorized');
  }
  next();
});

const stmtInputs = db.prepare(`
  SELECT i.id, i.source, i.raw_content, i.metadata, i.created_at,
         (SELECT COUNT(*) FROM actions a WHERE a.input_id = i.id) AS action_count,
         (SELECT COUNT(*) FROM actions a WHERE a.input_id = i.id AND a.status = 'failed') AS failed_count
    FROM inputs i
    ORDER BY i.id DESC
    LIMIT 50
`);

const stmtActions = db.prepare(`
  SELECT id, input_id, action_type, status, external_id, error, payload, created_at
    FROM actions
    ORDER BY id DESC
    LIMIT 50
`);

const stmtNotes = db.prepare(`
  SELECT id, content, tags, created_at
    FROM notes
    ORDER BY id DESC
    LIMIT 50
`);

const stmtStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM inputs) AS total_inputs,
    (SELECT COUNT(*) FROM inputs WHERE created_at >= datetime('now', '-24 hours')) AS inputs_24h,
    (SELECT COUNT(*) FROM inputs WHERE created_at >= datetime('now', '-7 days')) AS inputs_7d,
    (SELECT COUNT(*) FROM actions) AS total_actions,
    (SELECT COUNT(*) FROM actions WHERE status = 'success') AS actions_success,
    (SELECT COUNT(*) FROM actions WHERE status = 'failed') AS actions_failed,
    (SELECT COUNT(*) FROM notes) AS total_notes
`);

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  if (s == null) return '';
  const str = String(s).replace(/\s+/g, ' ').trim();
  return str.length <= n ? str : str.slice(0, n - 1) + '…';
}

function relativeTime(iso) {
  const then = new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime();
  const diffMs = Date.now() - then;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function statusBadge(status) {
  const cls = status === 'success' ? 'ok' : status === 'failed' ? 'err' : 'pending';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function summarizeAction(actionType, payload) {
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return escapeHtml(truncate(payload, 80));
  }
  switch (actionType) {
    case 'calendar':
      return escapeHtml(truncate(`${parsed.title} (${parsed.start ?? ''})`, 80));
    case 'todo':
      return escapeHtml(truncate(parsed.title ?? '', 80));
    case 'email_draft':
      return escapeHtml(truncate(`${parsed.subject ?? ''} → ${parsed.to ?? ''}`, 80));
    case 'whatsapp':
      return escapeHtml(truncate(parsed.message ?? '', 80));
    case 'note':
      return escapeHtml(truncate(parsed.content ?? '', 80));
    default:
      return escapeHtml(truncate(JSON.stringify(parsed), 80));
  }
}

function renderPage({ inputs, actions, notes, stats, token }) {
  const successRate = stats.total_actions > 0
    ? Math.round((stats.actions_success / stats.total_actions) * 100)
    : 100;

  const inputRows = inputs.map((row) => {
    const meta = row.metadata ? `<div class="meta">${escapeHtml(truncate(row.metadata, 60))}</div>` : '';
    const actionTag = row.action_count === 0
      ? '<span class="muted">no actions</span>'
      : row.failed_count > 0
        ? `<span class="badge err">${row.action_count} action${row.action_count === 1 ? '' : 's'} (${row.failed_count} failed)</span>`
        : `<span class="badge ok">${row.action_count} action${row.action_count === 1 ? '' : 's'}</span>`;
    return `
      <tr>
        <td class="num">#${row.id}</td>
        <td><span class="src">${escapeHtml(row.source)}</span></td>
        <td>
          <div title="${escapeHtml(row.raw_content)}">${escapeHtml(truncate(row.raw_content, 120))}</div>
          ${meta}
        </td>
        <td>${actionTag}</td>
        <td class="ts">${escapeHtml(relativeTime(row.created_at))}</td>
      </tr>`;
  }).join('');

  const actionRows = actions.map((row) => {
    const errCell = row.error
      ? `<div class="err-msg" title="${escapeHtml(row.error)}">${escapeHtml(truncate(row.error, 80))}</div>`
      : '';
    const extId = row.external_id
      ? `<code class="ext" title="${escapeHtml(row.external_id)}">${escapeHtml(truncate(row.external_id, 16))}</code>`
      : '<span class="muted">—</span>';
    return `
      <tr>
        <td class="num">#${row.id}</td>
        <td class="num"><a href="#input-${row.input_id}">#${row.input_id}</a></td>
        <td><span class="type">${escapeHtml(row.action_type)}</span></td>
        <td>${summarizeAction(row.action_type, row.payload)}</td>
        <td>${statusBadge(row.status)}${errCell}</td>
        <td>${extId}</td>
        <td class="ts">${escapeHtml(relativeTime(row.created_at))}</td>
      </tr>`;
  }).join('');

  const noteRows = notes.map((row) => `
    <tr>
      <td class="num">#${row.id}</td>
      <td>
        <div title="${escapeHtml(row.content)}">${escapeHtml(truncate(row.content, 140))}</div>
        ${row.tags ? `<div class="meta">${escapeHtml(row.tags)}</div>` : ''}
      </td>
      <td class="ts">${escapeHtml(relativeTime(row.created_at))}</td>
    </tr>`).join('');

  const tokenParam = `token=${encodeURIComponent(token)}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AI Brain</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      --bg: #fafaf8; --fg: #1a1a1a; --muted: #8a8a8a; --border: #e2e2dd;
      --card: #fff; --accent: #2563eb;
      --ok: #166534; --ok-bg: #dcfce7; --err: #991b1b; --err-bg: #fee2e2;
      --pending: #854d0e; --pending-bg: #fef3c7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f0f0f; --fg: #e8e8e8; --muted: #888; --border: #2a2a2a;
        --card: #161616; --accent: #60a5fa;
        --ok: #4ade80; --ok-bg: #052e16; --err: #f87171; --err-bg: #450a0a;
        --pending: #fbbf24; --pending-bg: #422006;
      }
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg); color: var(--fg); }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      margin: 0; padding: 24px; max-width: 1200px; margin: 0 auto; line-height: 1.5;
    }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 32px 0 12px; font-weight: 600; }
    .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0 8px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
    .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .stat .value { font-size: 22px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
    th { background: var(--bg); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    tr:last-child td { border-bottom: none; }
    .num { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .ts { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .src, .type { display: inline-block; padding: 1px 7px; background: var(--border); border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge.ok { background: var(--ok-bg); color: var(--ok); }
    .badge.err { background: var(--err-bg); color: var(--err); }
    .badge.pending { background: var(--pending-bg); color: var(--pending); }
    .meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .err-msg { font-size: 11px; color: var(--err); margin-top: 4px; }
    .muted { color: var(--muted); }
    .empty { padding: 16px; text-align: center; color: var(--muted); font-size: 13px; }
    code.ext { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; color: var(--muted); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; }
    .refresh { font-size: 12px; }
  </style>
</head>
<body>
  <div class="header-row">
    <div>
      <h1>AI Brain</h1>
      <div class="sub">Andrew's personal assistant · ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })} · Europe/London</div>
    </div>
    <a class="refresh" href="?${tokenParam}">↻ refresh</a>
  </div>

  <div class="stats">
    <div class="stat"><div class="label">Inputs total</div><div class="value">${stats.total_inputs}</div></div>
    <div class="stat"><div class="label">Last 24h</div><div class="value">${stats.inputs_24h}</div></div>
    <div class="stat"><div class="label">Last 7d</div><div class="value">${stats.inputs_7d}</div></div>
    <div class="stat"><div class="label">Action success</div><div class="value">${successRate}%</div></div>
    <div class="stat"><div class="label">Failed actions</div><div class="value">${stats.actions_failed}</div></div>
    <div class="stat"><div class="label">Notes</div><div class="value">${stats.total_notes}</div></div>
  </div>

  <h2>Recent inputs</h2>
  <table>
    <thead><tr><th>ID</th><th>Source</th><th>Content</th><th>Outcome</th><th>When</th></tr></thead>
    <tbody>${inputRows || '<tr><td colspan="5" class="empty">no inputs yet</td></tr>'}</tbody>
  </table>

  <h2>Recent actions</h2>
  <table>
    <thead><tr><th>ID</th><th>Input</th><th>Type</th><th>Detail</th><th>Status</th><th>External ID</th><th>When</th></tr></thead>
    <tbody>${actionRows || '<tr><td colspan="7" class="empty">no actions yet</td></tr>'}</tbody>
  </table>

  <h2>Recent notes</h2>
  <table>
    <thead><tr><th>ID</th><th>Note</th><th>When</th></tr></thead>
    <tbody>${noteRows || '<tr><td colspan="3" class="empty">no notes yet</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

router.get('/', (req, res) => {
  const inputs = stmtInputs.all();
  const actions = stmtActions.all();
  const notes = stmtNotes.all();
  const stats = stmtStats.get();
  const html = renderPage({
    inputs,
    actions,
    notes,
    stats,
    token: req.query.token || req.get('X-Brain-Token') || '',
  });
  res.type('text/html').send(html);
});

export default router;
