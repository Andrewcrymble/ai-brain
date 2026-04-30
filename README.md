# AI Brain

Andrew's personal AI assistant. A Node.js webhook service that ingests inputs from multiple sources (Plaud Note Pro voice transcripts, reMarkable handwriting, iOS Shortcuts), processes them through Claude, and routes outputs to Microsoft 365 (Outlook calendar / To Do / mail drafts) and the BeepMate WhatsApp group via Whapi.Cloud.

One process, one SQLite file, no queues, no microservices.

---

## Architecture at a glance

```
[ Plaud email forward ]──┐
[ reMarkable export   ]──┼──►  /ingest/*  ──►  Claude  ──►  router  ──┬──►  Outlook calendar
[ iOS Shortcut        ]──┘                                            ├──►  Microsoft To Do
                                                                      ├──►  Outlook mail draft
                                                                      └──►  WhatsApp (Whapi)

cron 07:00 Europe/London  ──►  daily briefing builder  ──►  WhatsApp
```

Every input is hashed and deduplicated. Every action attempt is logged in `actions` with success/failure, so nothing silently disappears.

---

## Local setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
# Fill in .env (see env-var walkthroughs below)
npm run migrate
npm run dev
```

The server listens on `PORT` (default 3000). Test it:

```bash
curl http://localhost:3000/health
```

Smoke-test the brain end-to-end:

```bash
curl -X POST http://localhost:3000/ingest \
  -H "X-Brain-Token: <your INGEST_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"source":"manual","content":"Remind me to call the florist tomorrow at 10am about the Smith funeral flowers"}'
```

You should get back a JSON response with `summary`, the actions Claude decided on, and their success/failure status.

---

## Microsoft Graph — Azure AD app registration

The brain uses **app-only auth** (client credentials flow), so it runs unattended on Railway without anyone signed in.

### 1. Register the app

1. Go to <https://entra.microsoft.com> → **Applications** → **App registrations** → **New registration**.
2. Name: `AI Brain` (or whatever you like).
3. Supported account types: **Accounts in this organisational directory only** (single tenant).
4. Leave Redirect URI blank. Click **Register**.
5. On the overview page, copy:
   - **Application (client) ID** → goes in `MS_CLIENT_ID`
   - **Directory (tenant) ID** → goes in `MS_TENANT_ID`

### 2. Create a client secret

1. **Certificates & secrets** → **New client secret**.
2. Description: `ai-brain`. Expiry: 24 months (set a reminder to rotate).
3. Copy the **Value** immediately (only shown once) → goes in `MS_CLIENT_SECRET`.

### 3. Grant API permissions

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.
2. Add all of these:
   - `Calendars.ReadWrite`
   - `Mail.ReadWrite`
   - `Tasks.ReadWrite`
3. Click **Grant admin consent for <tenant>** (you need to be a tenant admin, or ask one).

### 4. Set the user

`MS_USER_ID` is the email/UPN of the mailbox the brain operates on (Andrew's Outlook account, e.g. `andrew@crymbleandsons.com`).

> **Privacy note:** application permissions grant access to **every** mailbox in the tenant. If you want to lock the app down to just one user's mailbox, configure an [Application Access Policy](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access) in Exchange Online — recommended for production.

---

## BeepMate (WhatsApp send-only)

The brain sends WhatsApp via [BeepMate](https://beepmate.io). BeepMate is send-only — the brain pushes messages but never reads from WhatsApp.

1. Sign in at <https://beepmate.io>.
2. From your dashboard, copy your **API key** → `BEEPMATE_API_KEY`.
3. Copy your **ID** (your phone number in international format, e.g. `447545972340`, or a Group ID if you've set one up) → `BEEPMATE_TARGET_ID`.

Test the connection:

```bash
curl "https://beepmate.io/send?key=$BEEPMATE_API_KEY&id=$BEEPMATE_TARGET_ID&msg=hello%20from%20ai-brain"
```

---

## Plaud Note Pro forwarding

Plaud emails transcripts to your inbox. We forward those into the brain via either Power Automate or Make.com.

### Option A — Power Automate (Microsoft 365)

1. Create a flow: trigger **When a new email arrives (V3)** on Andrew's mailbox.
2. Filter: `From contains "plaud"` (or whatever Plaud sends from).
3. Action: **HTTP** → POST to `https://<your-railway-app>.up.railway.app/ingest/plaud`.
4. Headers:
   - `X-Brain-Token`: `<your INGEST_TOKEN>`
   - `Content-Type`: `application/json`
5. Body:
   ```json
   {
     "subject": "@{triggerOutputs()?['body/subject']}",
     "body": "@{triggerOutputs()?['body/body/content']}",
     "from": "@{triggerOutputs()?['body/from/emailAddress/address']}",
     "receivedAt": "@{triggerOutputs()?['body/receivedDateTime']}"
   }
   ```

### Option B — Make.com

1. Trigger: **Email** → **Watch emails** on Andrew's IMAP/Outlook account, filtered to Plaud.
2. Module: **HTTP** → **Make a request** with the same URL, headers, and body shape as above.

---

## iOS Shortcut payload

Build a Shortcut that:
1. **Dictate Text** → captures voice as a transcript
2. **Get Contents of URL**:
   - URL: `https://<your-railway-app>.up.railway.app/ingest/shortcut`
   - Method: `POST`
   - Headers: `X-Brain-Token: <INGEST_TOKEN>`, `Content-Type: application/json`
   - Request Body (JSON):
     ```json
     {
       "text": "<dictated text variable>",
       "context": {
         "location": "<current location>",
         "capturedAt": "<current date ISO>"
       }
     }
     ```

---

## Railway deploy

1. Push this repo to GitHub.
2. <https://railway.com> → **New Project** → **Deploy from GitHub repo**.
3. Add a **Volume** mounted at `/data` (so SQLite survives redeploys).
4. Set env vars (Service → Variables):
   - All from `.env.example`
   - `DB_PATH=/data/brain.db`
5. Railway will build via Nixpacks, run migrations on boot (`npm run migrate && npm start`), and hit `/health` to verify.

After first deploy, copy your service URL (e.g. `https://ai-brain-production.up.railway.app`) — that's what you point Plaud forwarding and iOS Shortcuts at.

---

## API reference

All endpoints require header `X-Brain-Token: <INGEST_TOKEN>`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Returns `{ ok: true, time }`. No auth. |
| POST | `/ingest` | Universal endpoint. Synchronous — returns `{ summary, actions }`. Body: `{ source, content, metadata? }`. |
| POST | `/ingest/plaud` | Plaud email webhook. Async (202). Body: `{ subject, body, from?, receivedAt? }`. |
| POST | `/ingest/remarkable` | reMarkable export. Async (202). Body: `{ content, notebook?, page?, capturedAt? }`. |
| POST | `/ingest/shortcut` | iOS Shortcut. Async (202). Body: `{ text, context? }`. |
| GET | `/summary/today` | Build today's briefing and post to WhatsApp. `?dry=1` builds without sending. |

---

## Database

Single SQLite file (`brain.db` by default, or `DB_PATH`).

- `inputs` — raw incoming content, deduped by SHA-256 of `raw_content`.
- `actions` — every fan-out attempt with `status` (`pending` / `success` / `failed`) and `external_id` (Graph event/task/draft id, etc.).
- `notes` — long-term prose memory written by the brain.

Inspect it with the `sqlite3` CLI or any SQLite GUI.

---

## Adding new behaviour

- **A new input source:** copy `src/routes/shortcut.js`, change the schema and `source` string, mount it in `src/index.js`.
- **A new action type:** extend the JSON schema in `src/claude.js`'s system prompt, add a `case` in `src/lib/router.js`, and add an integration helper if needed.
- **A new scheduled job:** add a file in `src/jobs/` and register it in `src/index.js` after `app.listen`.
