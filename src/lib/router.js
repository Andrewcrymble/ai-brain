import pino from 'pino';
import {
  recordAction,
  markActionSuccess,
  markActionFailed,
  recordNote,
} from './memory.js';
import { createEvent } from '../integrations/calendar.js';
import { createTask } from '../integrations/todo.js';
import { createDraft } from '../integrations/mail.js';
import { sendWhatsApp } from '../integrations/beepmate.js';

const log = pino({ name: 'router' });

/**
 * Take Claude's parsed JSON output and dispatch each action to the right
 * integration. Each action is wrapped in try/catch — one failure does not
 * abort the rest. Every attempt is recorded in the actions table.
 */
export async function route({ inputId, brainOutput }) {
  const results = [];
  const actions = Array.isArray(brainOutput?.actions) ? brainOutput.actions : [];

  for (const action of actions) {
    const actionId = recordAction({ inputId, type: action.type, payload: action });
    try {
      let externalId = null;
      switch (action.type) {
        case 'calendar': {
          const event = await createEvent(action);
          externalId = event?.id ?? null;
          break;
        }
        case 'todo': {
          const task = await createTask(action);
          externalId = task?.id ?? null;
          break;
        }
        case 'email_draft': {
          const draft = await createDraft(action);
          externalId = draft?.id ?? null;
          break;
        }
        case 'whatsapp': {
          const sent = await sendWhatsApp(action.message);
          externalId = sent?.message?.id ?? sent?.id ?? null;
          break;
        }
        case 'note': {
          const noteId = recordNote({ content: action.content, tags: action.tags });
          externalId = String(noteId);
          break;
        }
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
      markActionSuccess(actionId, externalId);
      results.push({ actionId, type: action.type, status: 'success', externalId });
    } catch (err) {
      log.error({ err, actionType: action.type }, 'action failed');
      markActionFailed(actionId, err);
      results.push({
        actionId,
        type: action.type,
        status: 'failed',
        error: err.message,
      });
    }
  }
  return results;
}
