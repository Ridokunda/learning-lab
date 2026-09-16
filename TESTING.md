# Verification

Checked locally on 16 September 2026 with Node 24 and headless Microsoft Edge. Simulated provider responses incur no API charges.

## Checks

- `npm run build`: preserved standalone quiz plus Vite client; local PDF.js/Mammoth assets load only when needed.
- `npm test`: original scoring/state regressions and six original API tests, plus all-format validation, FSRS ratings/idempotency, timezone boundary, migration, JWT verification, real SQLite concurrency/budget/failure tests, and backup restoration.
- `npm run test:browser`: generation/study flow, scheduled/free practice, locked answers after reload, recall autosave, saved feedback, manual cards, second-browser persistence, backup download, narrow layout, and document extraction/error handling.
- `npm run check:worker`: Cloudflare bundle dry run, previews disabled and assets routed through authentication.
- `npm run db:local` and `node tests/local-runtime.mjs` against Wrangler: actual workerd/D1 persistence, repeated review submission, stale conflicts, and atomic backup/ledger restore.
- Dependency audit: patched PDF.js installed; zero reported advisories at verification.

`tests/db.js` uses actual SQLite transactions, so SQL constraints and rollback are exercised. The browser fixture server binds localhost and is not deployed.

## Remaining verification

The Worker is deployed and the remote D1 migration succeeded. After dashboard Access setup, signed-out requests to the root, a compiled asset, the library API, and generation API all redirect to the configured Access team. The application audience was verified against Cloudflare-signed redirect metadata and configured in the Worker. The OpenAI key is now installed and verified as a Worker secret. Verification did not call OpenAI. The Access team domain is configured, but Cloudflare returned 403 for application creation and identity-provider configuration using Wrangler credentials. The owner subsequently completed dashboard setup; the application does not appear in the Wrangler-scoped app listing, so policy details could not be independently inspected. Live Access OTP login/logout, authenticated remote persistence, a second physical device, and production Free-plan CPU/quota behavior remain unverified. Subscription inspection was also denied; no plan upgrade was requested. JWT tests cover signatures, issuer/audience, expiry/missing expiry, tampering, and email. Follow [DEPLOYMENT.md](DEPLOYMENT.md).

The production OpenAI secret is configured, but no real provider requests were made during verification: live model access, provider billing, and factual accuracy remain unverified. Structural checks do not establish factual correctness.

The current library is one bounded 1.5 MB D1 document loaded online. This is not a large-library performance certification, offline synchronization, or exhaustive accessibility/browser audit. Mixed-session queues are transient; completed work is saved.
