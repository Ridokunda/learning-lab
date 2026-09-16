# Private deployment on Cloudflare Free

Production deployment requires a Cloudflare account, the owner's sign-in email, and Access application configuration. Blank identity variables and the placeholder D1 ID deliberately fail closed.

## Deployment status — 16 September 2026

The Worker is deployed at https://learning-lab.ridokundanetshi.workers.dev and the remote D1 schema is migrated. The configured team is `still-salad-cf3b.cloudflareaccess.com`; the allowed email is `ridokundanetshi@gmail.com`. Preview URLs are disabled. `ACCESS_AUD` is configured from Cloudflare-signed redirect metadata. Signed-out assets and APIs redirect to Access login. The OpenAI key is installed and verified as a Worker secret (converted from an initially configured plain-text binding). No live OpenAI requests were made during setup.

Wrangler credentials can list Access applications but Cloudflare denied application creation and identity-provider configuration (403). The owner completed dashboard setup. Access now protects the hostname; the Worker independently checks the configured audience and exact owner email. Owner login and dashboard policy details still need an end-to-end check. Authenticated production behavior and Free-plan CPU compliance still require verification; no paid plan or upgrade was provisioned.

## Provision and publish

1. Use Node 24+, run `npm ci`, and authenticate with `npx wrangler login`.
2. Keep **Workers Free** and select **Zero Trust Free** for Access. Do not subscribe to Workers Paid, use temporary preview accounts, or enable paid upgrades. Subscription selection is an account setting the application cannot enforce.
3. Run `npx wrangler d1 create learning-lab`. Put its database ID in `wrangler.jsonc`; keep the `DB` binding and database name.
4. Run `npm run db:remote`, then `npm run deploy`. This initial deployment returns 503 until Access is configured; do not add secrets or personal content yet.
5. Protect the production `workers.dev` hostname with Cloudflare Access. Configure **One-time PIN** login and an **Allow → Emails → your exact email** policy. Remove broad allow/bypass rules. Cover the entire hostname, including `/api/*` and `/assets/*`. See [workers.dev Access protection](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
6. In `wrangler.jsonc`, set `ACCESS_TEAM_DOMAIN` (e.g. `your-team.cloudflareaccess.com`, no scheme), `ACCESS_AUD` (application audience tag), and `ALLOWED_EMAIL`. Keep `preview_urls: false` and `assets.run_worker_first: true`. Do not deploy `LOCAL_DEV`. Redeploy.
7. Verify the boundary below, then run `npx wrangler secret put OPENAI_API_KEY`. Enter the key at the CLI prompt, never in a command argument, committed file, chat, or backup.
8. Sign in, import your backup, inspect the $5 budget/timezone, and make one explicit generation to verify provider access and cloud persistence.

## Verify production

- Signed-out root, assets, and `/api/library` must require login or deny access. Unauthorized `/api/generate` must not create ledger records or incur charges.
- Verify a different email is denied. Sign out and attempt a save from an existing tab; unsaved text should remain available.
- Confirm preview/version URLs are disabled and any alternate routes have equivalent protection. Worker token verification applies independently.
- Sign out/in and reopen content. Use a second device and verify persistence and rejection of stale saves.
- Set budget to zero: generation must fail while studying remains usable. Confirm ordinary study produces no provider calls.
- Check deployed Worker analytics: representative cold requests, generation completion, imports, and a full library must fit **10 ms CPU per invocation** on Free. A bundle dry run and local wall-clock timings do not establish production CPU compliance. Optimize/partition work if necessary; do not upgrade plans.

## Limits and recovery

Checked 16 September 2026: Workers Free provides 100,000 requests/day and 10 ms CPU per invocation; D1 Free provides 5 million rows read/day, 100,000 written/day, and 5 GB total storage. Exhaustion on Free fails requests instead of granting paid capacity. Verify current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). The app never provisions paid services or changes subscriptions.

After a Worker interruption, a `running` request blocks AI calls. Reload Settings; after ten minutes select **Mark interrupted (keep reservation)**, check provider usage, then decide whether to retry explicitly. Never delete uncertain charges or set them to zero.

D1 failures are never reported as saved. Keep the tab open, download unsaved work, and retry after recovery. Back up regularly; restore retains live cost history.

Local runtime verification (adds only local test data):

```sh
npx wrangler dev --ip 127.0.0.1 --port 4181 --var LOCAL_DEV:true
node tests/local-runtime.mjs
```
