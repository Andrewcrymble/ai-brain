import { graph, userPath } from './graph.js';

/**
 * Create a draft email in the mailbox. The draft is NOT sent — Andrew reviews
 * and sends from Outlook.
 * @param {{ to: string|string[], subject: string, body: string }} args
 */
export async function createDraft({ to, subject, body }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  const message = {
    subject,
    body: { contentType: 'text', content: body },
    toRecipients: recipients,
  };

  // POST to /messages creates a draft by default (no sending).
  return graph.api(`${userPath}/messages`).post(message);
}

/**
 * List recent unread inbox messages.
 */
export async function listRecentUnread(limit = 10) {
  const res = await graph
    .api(`${userPath}/mailFolders/Inbox/messages`)
    .filter('isRead eq false')
    .top(limit)
    .select('id,subject,from,receivedDateTime,bodyPreview')
    .orderby('receivedDateTime desc')
    .get();
  return res.value;
}
