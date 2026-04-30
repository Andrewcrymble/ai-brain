import cron from 'node-cron';
import pino from 'pino';
import { config } from '../config.js';
import { listTodayEvents } from '../integrations/calendar.js';
import { listOpenTasks } from '../integrations/todo.js';
import { listRecentUnread } from '../integrations/mail.js';
import { sendWhatsApp } from '../integrations/beepmate.js';
import { recentInputs } from '../lib/memory.js';
import { complete } from '../claude.js';

const log = pino({ name: 'dailySummary' });

const SYSTEM = `You are Andrew's morning briefing assistant. Build a concise WhatsApp message summarising the day ahead.

Rules:
- UK English.
- Plain text, short bullet sections (Calendar / Tasks / Inbox / Notes).
- Aim for under 600 characters. No emojis. No markdown headings.
- If a section is empty, omit it entirely.
- Times in Europe/London, 24-hour format.`;

async function safeCall(fn, label) {
  try {
    return await fn();
  } catch (err) {
    log.error({ err: err.message, label }, 'briefing subcall failed');
    return null;
  }
}

export async function buildAndSendDailySummary({ skipWhatsapp = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);

  const [events, tasks, unread, inputs] = await Promise.all([
    safeCall(() => listTodayEvents(), 'calendar'),
    safeCall(() => listOpenTasks(), 'todo'),
    safeCall(() => listRecentUnread(20), 'mail'),
    Promise.resolve(recentInputs(24)),
  ]);

  const overdue = (tasks ?? []).filter(
    (t) => t.dueDateTime && new Date(t.dueDateTime.dateTime) < new Date(today)
  );
  const dueToday = (tasks ?? []).filter(
    (t) =>
      t.dueDateTime &&
      new Date(t.dueDateTime.dateTime).toISOString().slice(0, 10) === today
  );

  const data = {
    today,
    timezone: config.TZ,
    calendar: (events?.value ?? []).map((e) => ({
      subject: e.subject,
      start: e.start?.dateTime,
      end: e.end?.dateTime,
      location: e.location?.displayName,
      isAllDay: e.isAllDay,
    })),
    overdueTasks: overdue.map((t) => ({
      title: t.title,
      due: t.dueDateTime?.dateTime,
      list: t.listName,
    })),
    tasksDueToday: dueToday.map((t) => ({ title: t.title, list: t.listName })),
    unreadEmailCount: (unread ?? []).length,
    unreadEmailHighlights: (unread ?? []).slice(0, 5).map((m) => ({
      from: m.from?.emailAddress?.address,
      subject: m.subject,
    })),
    last24hInputs: (inputs ?? []).map((i) => ({
      source: i.source,
      snippet: i.raw_content.slice(0, 120),
    })),
  };

  const message = await complete({
    system: SYSTEM,
    user: `Build the morning briefing from this data:\n\n${JSON.stringify(data, null, 2)}`,
    maxTokens: 1024,
  });

  let whatsappResult = null;
  if (!skipWhatsapp) {
    try {
      whatsappResult = await sendWhatsApp(message);
    } catch (err) {
      log.error({ err: err.message }, 'whatsapp send failed');
    }
  }

  log.info({ date: today, eventCount: data.calendar.length }, 'briefing built');

  return {
    date: today,
    message,
    sent: !skipWhatsapp && !!whatsappResult,
    eventCount: data.calendar.length,
    overdueCount: data.overdueTasks.length,
    dueTodayCount: data.tasksDueToday.length,
    unreadCount: data.unreadEmailCount,
  };
}

export function scheduleDailySummary() {
  cron.schedule(
    '0 7 * * *',
    () => {
      buildAndSendDailySummary().catch((err) =>
        log.error({ err: err.message }, 'cron briefing failed')
      );
    },
    { timezone: config.TZ }
  );
  log.info(`daily summary scheduled for 07:00 ${config.TZ}`);
}
