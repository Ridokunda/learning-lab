import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  emptyLibrary,
  librarySchema,
  migrateLegacy,
  review,
  monthKey,
  now,
} from "../shared/model.js";
import {
  inputSchema,
  payload,
  reservation,
  provider,
  parsePack,
  parseResult,
  cost,
} from "./ai.js";

const keys = new Map();
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const encode = (value) => {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 1500000)
    fail(
      413,
      "The library is too large for this version (1.5 MB). Export a backup before removing content.",
    );
  return text;
};
export async function verifyIdentity(token, key, env) {
  const { payload } = await jwtVerify(token, key, {
    issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
    audience: env.ACCESS_AUD,
    algorithms: ["RS256"],
  });
  if (
    !payload.exp ||
    payload.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()
  )
    fail(401, "Sign in again to continue.");
}
export async function authorize(request, env) {
  const url = new URL(request.url);
  if (
    env.LOCAL_DEV === "true" &&
    ["127.0.0.1", "localhost"].includes(url.hostname)
  )
    return;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL)
    fail(503, "Private sign-in is not configured.");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let key = keys.get(issuer);
  if (!key) {
    key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keys.set(issuer, key);
  }
  try {
    await verifyIdentity(
      request.headers.get("Cf-Access-Jwt-Assertion") || "",
      key,
      env,
    );
  } catch {
    fail(401, "Sign in again to continue.");
  }
}
async function read(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "JSON is required.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Missing body");
  let size = 0,
    text = "";
  const d = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (
        size >
        (new URL(request.url).pathname === "/api/import" ? 10000000 : 1800000)
      )
        fail(413, "Request too large");
      text += d.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(text + d.decode());
  } catch {
    fail(400, "Invalid JSON");
  }
}
export async function load(db) {
  const existing = await db
    .prepare("SELECT revision,data FROM library WHERE id=1")
    .first();
  if (existing)
    return { revision: existing.revision, library: JSON.parse(existing.data) };
  await db
    .prepare("INSERT OR IGNORE INTO library(id,data) VALUES(1,?)")
    .bind(JSON.stringify(emptyLibrary()))
    .run();
  const row = await db
    .prepare("SELECT revision,data FROM library WHERE id=1")
    .first();
  return { revision: row.revision, library: JSON.parse(row.data) };
}
async function ledger(db) {
  return (
    await db.prepare("SELECT * FROM ai_requests ORDER BY created_at DESC").all()
  ).results;
}
async function save(db, lib, revision) {
  const result = await db
    .prepare(
      "UPDATE library SET data=?, revision=revision+1 WHERE id=1 AND revision=?",
    )
    .bind(encode(librarySchema.parse(lib)), revision)
    .run();
  if (!result.meta.changes)
    fail(
      409,
      "Another device saved newer progress. Reload before trying again; your unsaved text is still on screen.",
    );
  return revision + 1;
}
async function hash(value) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function generate(body, env, fetchImpl = fetch) {
  if (
    typeof body.requestId !== "string" ||
    !/^[a-zA-Z0-9-]{10,100}$/.test(body.requestId)
  )
    fail(400, "A valid request identifier is required.");
  const feedback = body.kind === "feedback";
  let input, context;
  if (feedback) {
    const current = await load(env.DB);
    const pack = current.library.packs.find((p) => p.id === body.packId),
      item = pack?.recall.find((i) => i.id === body.itemId),
      answer = item?.answers.find((a) => a.id === body.answerId);
    if (!answer) fail(404, "Save the answer before requesting feedback.");
    input = { prompt: item.prompt, example: item.example, answer: answer.text };
    context = { packId: pack.id, itemId: item.id, answerId: answer.id };
  } else input = inputSchema.parse(body.input);
  const fingerprint = await hash({ input, context, feedback });
  const prior = await env.DB.prepare("SELECT * FROM ai_requests WHERE id=?")
    .bind(body.requestId)
    .first();
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(409, "That request identifier belongs to different input.");
    return json(prior, prior.status === "running" ? 202 : 200);
  }
  if (!env.OPENAI_API_KEY)
    fail(503, "The server OpenAI secret is not configured.");
  const p = payload(input, feedback),
    reserved = reservation(p);
  const current = await load(env.DB);
  const month = monthKey(current.library.settings.timezone);
  // The unique partial index serializes requests globally. Budget check and reservation
  // happen in one SQLite statement, including against concurrent settings changes.
  let inserted;
  try {
    inserted = await env.DB.prepare(
      `INSERT INTO ai_requests(id,fingerprint,month,status,reserved,created_at)
 SELECT ?,?,?,'running',?,? WHERE NOT EXISTS(SELECT 1 FROM ai_requests WHERE status='running')
 AND (SELECT COALESCE(SUM(COALESCE(cost,reserved)),0) FROM ai_requests WHERE month=?)+? <= (SELECT json_extract(data,'$.settings.monthlyBudget') FROM library WHERE id=1)`,
    )
      .bind(
        body.requestId,
        fingerprint,
        month,
        reserved,
        now(),
        month,
        reserved,
      )
      .run();
  } catch {
    fail(409, "An AI request is already in progress. Check request history.");
  }
  if (!inserted.meta.changes)
    fail(
      429,
      "An AI request is already running or the monthly app budget is exhausted. Saved material remains available.",
    );
  let actual = null,
    usage = null;
  try {
    const result = await provider(p, env.OPENAI_API_KEY, fetchImpl);
    actual = cost(result);
    usage = result.usage || null;
    const raw = parseResult(result);
    let pack, feedbackText;
    if (feedback) {
      if (
        typeof raw.feedback !== "string" ||
        !raw.feedback.trim() ||
        raw.feedback.length > 6000
      )
        throw Error("Invalid feedback");
      feedbackText = raw.feedback;
    } else pack = parsePack(raw, input);
    // Merge generated content with the latest progress using optimistic concurrency.
    for (let attempt = 0; attempt < 8; attempt++) {
      const latest = await load(env.DB);
      if (feedback) {
        const answer = latest.library.packs
          .find((p) => p.id === context.packId)
          ?.recall.find((i) => i.id === context.itemId)
          ?.answers.find((a) => a.id === context.answerId);
        if (!answer || answer.text !== input.answer)
          throw Error("The answer changed while feedback was generated.");
        answer.feedback = feedbackText;
      } else latest.library.packs.push(pack);
      const savedResult = JSON.stringify({
        packId: pack?.id || context.packId,
        usage,
        estimatedCost: actual,
      });
      // Both writes are atomic. The second condition ties completion to this CAS.
      const results = await env.DB.batch([
        env.DB.prepare(
          "UPDATE library SET data=?,revision=revision+1 WHERE id=1 AND revision=?",
        ).bind(encode(librarySchema.parse(latest.library)), latest.revision),
        env.DB.prepare(
          "UPDATE ai_requests SET status='succeeded',cost=?,result=?,finished_at=? WHERE id=? AND changes()=1",
        ).bind(actual, savedResult, now(), body.requestId),
      ]);
      if (results[0].meta.changes)
        return json(
          await env.DB.prepare("SELECT * FROM ai_requests WHERE id=?")
            .bind(body.requestId)
            .first(),
        );
    }
    throw Error("Could not save because other devices kept updating.");
  } catch (error) {
    await env.DB.prepare(
      "UPDATE ai_requests SET status='failed',cost=?,error=?,finished_at=? WHERE id=? AND status='running'",
    )
      .bind(
        actual,
        "Generation did not complete: " +
          (error.message || "unknown failure").slice(0, 250),
        now(),
        body.requestId,
      )
      .run();
    return json(
      await env.DB.prepare("SELECT * FROM ai_requests WHERE id=?")
        .bind(body.requestId)
        .first(),
    );
  }
}
export async function api(request, env) {
  const url = new URL(request.url),
    path = url.pathname;
  const db = env.DB;
  if (request.method === "GET" && path === "/api/library") {
    const current = await load(db);
    return json({ ...current, requests: await ledger(db) });
  }
  if (request.method === "GET" && path === "/api/export") {
    const current = await load(db);
    return json({
      kind: "learning-lab",
      version: 2,
      exportedAt: now(),
      library: current.library,
      requests: await ledger(db),
    });
  }
  if (request.method !== "POST") fail(404, "Not found");
  if (request.headers.get("origin") !== url.origin)
    fail(403, "Use the app on this origin.");
  const body = await read(request);
  if (path === "/api/generate") return generate(body, env);
  if (path === "/api/resolve") {
    if (typeof body.requestId !== "string")
      fail(400, "Invalid request identifier");
    const result = await db
      .prepare(
        "UPDATE ai_requests SET status='uncertain',error='Interrupted request acknowledged; full reservation retained',finished_at=? WHERE id=? AND status='running' AND created_at<?",
      )
      .bind(
        now(),
        body.requestId,
        new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      )
      .run();
    if (!result.meta.changes)
      fail(
        409,
        "Only requests still running after ten minutes can be marked interrupted.",
      );
    return json({ ok: true });
  }
  const current = await load(db);
  if (path === "/api/review") {
    const c = current.library.packs
      .find((p) => p.id === body.packId)
      ?.flashcards.find((c) => c.id === body.cardId);
    if (c?.reviews.some((r) => r.id === body.requestId)) return json(current);
  }
  if (body.revision !== current.revision)
    fail(
      409,
      "Another device saved newer progress. Reload before saving again.",
    );
  if (path === "/api/save") {
    const library = librarySchema.parse(body.library);
    return json({ revision: await save(db, library, current.revision) });
  }
  if (path === "/api/review") {
    const p = current.library.packs.find((p) => p.id === body.packId),
      index = p?.flashcards.findIndex((c) => c.id === body.cardId);
    if (index === undefined || index < 0) fail(404, "Card not found");
    if (typeof body.requestId !== "string" || body.requestId.length > 100)
      fail(400, "Invalid review ID");
    p.flashcards[index] = review(
      p.flashcards[index],
      body.rating,
      body.requestId,
    );
    p.updatedAt = now();
    return json({
      revision: await save(db, current.library, current.revision),
      library: current.library,
    });
  }
  if (path === "/api/import") {
    let incoming;
    if (body.backup?.kind === "learning-lab-local")
      incoming = migrateLegacy(body.backup);
    else {
      if (body.backup?.kind !== "learning-lab" || body.backup?.version !== 2)
        fail(400, "Unsupported backup version");
      incoming = librarySchema.parse(body.backup.library);
    }
    const all = await ledger(db);
    if (all.some((r) => r.status === "running"))
      fail(409, "Wait for the running AI request before restoring.");
    const statements = [
      db
        .prepare(
          "UPDATE library SET data=?,revision=revision+1 WHERE id=1 AND revision=?",
        )
        .bind(encode(incoming), current.revision),
    ];
    // Restore historical reservations conservatively; never replace or delete the live ledger.
    const records = body.backup.requests || [];
    if (!Array.isArray(records)) fail(400, "Invalid request history");
    for (const r of records) {
      if (
        typeof r.id !== "string" ||
        r.id.length > 100 ||
        typeof r.month !== "string" ||
        !/^\d{4}-\d{2}$/.test(r.month) ||
        !Number.isFinite(r.reserved) ||
        r.reserved < 0 ||
        r.reserved > 10 ||
        !(r.cost === null || (Number.isFinite(r.cost) && r.cost >= 0)) ||
        typeof r.created_at !== "string"
      )
        fail(400, "Invalid request history");
    }
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO ai_requests(id,fingerprint,month,status,reserved,cost,result,error,created_at,finished_at) SELECT json_extract(value,'$.id'), COALESCE(json_extract(value,'$.fingerprint'),''), json_extract(value,'$.month'),'restored',json_extract(value,'$.reserved'),json_extract(value,'$.cost'),json_extract(value,'$.result'),'Restored history',json_extract(value,'$.created_at'),json_extract(value,'$.finished_at') FROM json_each(?) WHERE changes()=1`,
        )
        .bind(JSON.stringify(records)),
    );
    const results = await db.batch(statements);
    if (!results[0].meta.changes) fail(409, "Library changed during restore.");
    return json(await load(db));
  }
  fail(404, "Not found");
}
export default {
  async fetch(request, env) {
    try {
      await authorize(request, env);
      if (new URL(request.url).pathname.startsWith("/api/"))
        return await api(request, env);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      return new Response(response.body, { status: response.status, headers });
    } catch (e) {
      return json(
        {
          error: e.status
            ? e.message
            : e.name === "ZodError"
              ? "Invalid data. Check field lengths and required values."
              : "The operation failed. Your last saved data is unchanged; reload to check before retrying.",
        },
        e.status || (e.name === "ZodError" ? 400 : 500),
      );
    }
  },
};
