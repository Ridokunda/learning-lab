# Learning Lab

A private, mobile-friendly learning library with flashcards, quizzes, lessons, and written recall. Generation and AI answer feedback are explicit paid actions. Opening the app, studying, searching, reviewing, and editing cards never call OpenAI.

For the complete architecture, functionality, technology stack, data model, API, security, and maintenance guide, see [Project Documentation](PROJECT_DOCUMENTATION.md).

## Run the new app locally

Use **Node.js 24 or newer**. The original Windows launcher still opens the legacy quiz for migration.

```sh
npm ci
npm run build
npm run db:local
npx wrangler dev --ip 127.0.0.1 --var LOCAL_DEV:true
```

Open the localhost URL Wrangler prints. `LOCAL_DEV` bypasses sign-in only on localhost; never add it to deployment configuration. Saved study features work without an OpenAI key. For local generation only, copy `.dev.vars.example` to ignored `.dev.vars` and configure the key there. Never put it in browser code or backups.

## Learning

- **Home/library:** continue the last pack and format, see due-card totals, search titles/topics, filter formats, rename, archive, and restore archived packs.
- **Create:** select any combination of 20 flashcards, 20 quiz questions, one lesson, and five recall exercises. Regeneration saves a separate pack. Create empty packs and manual cards without AI.
- **Documents:** PDF.js and Mammoth extract text locally. Review/edit before generation. Maximum file size is 10 MB; selected source text is limited to 30,000 characters. Larger previews remain visible until you select an excerpt; nothing is silently truncated. Only selected text and filename are saved. PDF page labels are retained; DOCX does not claim page references. Scanned/password-protected PDFs are rejected.
- **Flashcards:** reveal before rating Again, Hard, Good, or Easy. Server-side `ts-fsrs` uses 90% retention with default parameters and deterministic intervals. Free practice never changes schedules. Scheduling uses server time; display uses your timezone, default Africa/Johannesburg.
- **Quizzes:** preserves the original 120 questions in six groups, scoring and explanations. Answers save as you work and lock after submission. Attempts are retained; missed-question practice uses separate answers.
- **Recall:** drafts autosave; save before revealing the example. Self-assessment is free. Explicit AI feedback is saved with the answer.
- **Mixed practice:** a roughly 30-minute queue prioritizes due cards, missed questions, then recall. Completed work persists; the queue itself is tab-local.

## Migration and backups

Open the old app **in the same browser and origin where you studied**, using `Start Learning Lab.cmd`, `node server.cjs`, or `index.html`. Select **Export for hosted app**. In the new app, open Settings & backups, export any existing cloud library, then restore the local JSON. Generated quizzes, answers, and submitted groups are retained. `file://` and localhost have separate browser storage; export from each if needed.

Version 2 backups include content, sources, schedules/reviews, quiz attempts/drafts, recall drafts/answers/feedback, settings, and generation history. Restore replaces the library after validation and revision checking. Live cost records cannot be erased by a restore; imported records merge by request ID. Keys and Access tokens are never included. Keep backups private.

## Privacy and costs

The Worker validates Access JWT signatures, issuer, audience, expiry, and the allowed email before serving assets or APIs. Missing configuration fails closed. Preview URLs are disabled. Writes require same-origin JSON requests.

Generation retains `gpt-5-nano`, strict structured output, `store: false`, minimal reasoning, and bounded output: 16,000 tokens per pack, 2,000 for feedback. No automatic retries. Estimates use $0.05/million input and $0.40/million output tokens from the [official model documentation](https://developers.openai.com/api/docs/models/gpt-5-nano). Provider billing is authoritative; `store: false` does not override other provider retention policies.

The default monthly app budget is **US $5**. One atomic SQL statement reserves a conservative maximum before each paid call. A unique partial index serializes AI calls across devices. Usage reconciles the reservation even if content validation fails; unknown usage retains it. After ten minutes, an interrupted request can be acknowledged in Settings without removing its reservation. Subsequent retries remain explicit. This budget covers this app, not other account activity.

Generation IDs are persisted before provider calls and bound to an input fingerprint. Repeating an ID returns its status/result. Validated content and success commit atomically. Reconnection never triggers automatic regeneration.

## Persistence and first-version limits

D1 stores a versioned library document plus a separate indexed cost/history ledger. Revisions reject stale writes from other devices. Failed saves leave drafts visible with retry, reload, and unsaved-backup controls. The library document is bounded at **1.5 MB** to stay below D1's per-value limit; larger libraries require per-pack storage before raising this bound. Archiving hides content but does not free storage. Synchronization is online-first.

## Deployment and development

See [DEPLOYMENT.md](DEPLOYMENT.md). The Worker and D1 database are deployed at https://learning-lab.ridokundanetshi.workers.dev. The owner email and Access team domain are configured. Cloudflare Access now protects the hostname, and the Worker audience is configured from verified, signed Access metadata. Signed-out requests redirect to login; owner login still needs an end-to-end check. The OpenAI key is installed and verified as a Worker secret. No live OpenAI requests were made during setup; provider access remains unverified.

```sh
npm run build
npm test
npm run test:browser
npm run check:worker
```

Browser tests use installed Microsoft Edge and a fixture provider. See [TESTING.md](TESTING.md).

| Location | Purpose |
| --- | --- |
| `web/` | Vanilla JS screens, API client, document extraction, responsive styles |
| `shared/model.js` | Validation, starter bank, FSRS, migration, mixed queue |
| `worker/` | Access verification, D1, budget and generation |
| `migrations/` | D1 schema and indexes |
| `tests/` | SQLite, JWT, scheduling, browser/document checks |
| `src/`, `index.html`, `server.cjs` | Preserved legacy app and migration exporter |
