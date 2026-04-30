import { graph, userPath } from './graph.js';
import { config } from '../config.js';

/**
 * Create a calendar event on Andrew's primary calendar.
 * @param {{ title: string, start: string, end: string, location?: string, notes?: string }} args
 */
export async function createEvent({ title, start, end, location, notes }) {
  const event = {
    subject: title,
    start: { dateTime: start, timeZone: config.TZ },
    end: { dateTime: end, timeZone: config.TZ },
    body: { contentType: 'text', content: notes ?? '' },
  };
  if (location) {
    event.location = { displayName: location };
  }
  return graph.api(`${userPath}/calendar/events`).post(event);
}

/**
 * List events for today (00:00 → 23:59 in the user's timezone).
 * Uses calendarView so recurring instances are expanded.
 */
export async function listTodayEvents() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return graph
    .api(`${userPath}/calendarView`)
    .query({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
    })
    .header('Prefer', `outlook.timezone="${config.TZ}"`)
    .select('id,subject,start,end,location,bodyPreview,isAllDay')
    .orderby('start/dateTime')
    .top(50)
    .get();
}
