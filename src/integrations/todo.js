import { graph, userPath } from './graph.js';

const listIdCache = new Map();

async function resolveListId(name) {
  if (listIdCache.has(name)) return listIdCache.get(name);
  const lists = await graph.api(`${userPath}/todo/lists`).get();
  const found =
    lists.value.find((l) => l.displayName === name) ??
    lists.value.find((l) => l.wellknownListName === 'defaultList') ??
    lists.value[0];
  if (!found) throw new Error(`No To Do lists found for user`);
  listIdCache.set(name, found.id);
  return found.id;
}

/**
 * Create a To Do task.
 * @param {{ title: string, due?: string|null, list?: string, notes?: string }} args
 */
export async function createTask({ title, due, list = 'Tasks', notes }) {
  const listId = await resolveListId(list);
  const task = { title };
  if (notes) task.body = { content: notes, contentType: 'text' };
  if (due) task.dueDateTime = { dateTime: due, timeZone: 'UTC' };
  return graph.api(`${userPath}/todo/lists/${listId}/tasks`).post(task);
}

/**
 * List all open (not completed) tasks across all lists.
 */
export async function listOpenTasks() {
  const lists = await graph.api(`${userPath}/todo/lists`).get();
  const out = [];
  for (const l of lists.value) {
    try {
      const res = await graph
        .api(`${userPath}/todo/lists/${l.id}/tasks`)
        .filter("status ne 'completed'")
        .top(100)
        .get();
      for (const t of res.value) {
        out.push({ ...t, listName: l.displayName });
      }
    } catch {
      // skip lists we cannot read (rare)
    }
  }
  return out;
}
