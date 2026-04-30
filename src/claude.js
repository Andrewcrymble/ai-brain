import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { db } from './db.js';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Andrew's personal AI brain. Andrew is a funeral director at David Crymble & Sons in Belfast. He runs several side ventures including ChatWrapped and Kenya Sunbeam Ministries. He is married to Nicola.

Your job: read the input below and decide what to do with it. Respond ONLY with valid JSON matching this schema:

{
  "summary": "one-line description of what this input is",
  "actions": [
    { "type": "calendar", "title": "...", "start": "ISO8601", "end": "ISO8601", "location": "...", "notes": "..." },
    { "type": "todo", "title": "...", "due": "ISO8601 or null", "list": "Tasks", "notes": "..." },
    { "type": "email_draft", "to": "...", "subject": "...", "body": "..." },
    { "type": "whatsapp", "message": "..." },
    { "type": "note", "content": "...", "tags": "comma,separated" }
  ]
}

Rules:
- Output an empty actions array if no action is warranted.
- Sign emails as "Andrew Crymble" by default. Sign Kenya Sunbeam emails as "Nicola Crymble".
- Use UK English.
- Times are Europe/London.
- Be concise — the user is busy.
- If the input mentions a 4-digit case reference, include it in note content with tag "case-ref".`;

const stmtRecentNotes = db.prepare(
  'SELECT content, tags, created_at FROM notes ORDER BY id DESC LIMIT 20'
);
const stmtRecentActions = db.prepare(
  'SELECT action_type, payload, status, created_at FROM actions ORDER BY id DESC LIMIT 10'
);

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {}
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error(`Could not parse JSON from Claude response: ${text.slice(0, 300)}`);
}

/**
 * Process an input through the brain. Pulls recent memory as context,
 * sends to Claude, returns parsed JSON output { summary, actions }.
 * @param {{ source: string, content: string, metadata?: object }} input
 */
export async function processInput({ source, content, metadata }) {
  const recentNotes = stmtRecentNotes.all();
  const recentActions = stmtRecentActions.all().map((a) => ({
    ...a,
    payload: safeParse(a.payload),
  }));

  const contextBlock = JSON.stringify(
    {
      now: new Date().toISOString(),
      timezone: config.TZ,
      recentNotes,
      recentActions,
    },
    null,
    2
  );

  const userMessage = [
    '## Context (recent memory)',
    '```json',
    contextBlock,
    '```',
    '',
    '## New input',
    `Source: ${source}`,
    metadata ? `Metadata: ${JSON.stringify(metadata)}` : '',
    'Content:',
    content,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: config.CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseJsonResponse(text);
  if (!Array.isArray(parsed.actions)) parsed.actions = [];
  return parsed;
}

/**
 * Generic completion helper used by jobs (e.g. daily summary).
 * @param {{ system: string, user: string, maxTokens?: number }} args
 */
export async function complete({ system, user, maxTokens = 2048 }) {
  const response = await client.messages.create({
    model: config.CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
