import test from "node:test";
import assert from "node:assert/strict";
import worker, { generate, load } from "../worker/index.js";
import { database } from "./db.js";
import { newCard } from "../shared/model.js";
const req = (body) =>
  new Request("http://localhost/api/resolve", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("interrupted requests retain budget reservations and cannot resolve early", async () => {
  const env = { DB: database(), LOCAL_DEV: "true" };
  await load(env.DB);
  await env.DB.prepare(
    "INSERT INTO ai_requests(id,fingerprint,month,status,reserved,created_at) VALUES('interrupted','hash','2026-09','running',0.1,?)",
  )
    .bind(new Date().toISOString())
    .run();
  assert.equal(
    (await worker.fetch(req({ requestId: "interrupted" }), env)).status,
    409,
  );
  await env.DB.prepare("UPDATE ai_requests SET created_at=?")
    .bind(new Date(Date.now() - 660000).toISOString())
    .run();
  assert.equal(
    (await worker.fetch(req({ requestId: "interrupted" }), env)).status,
    200,
  );
  const r = await env.DB.prepare("SELECT * FROM ai_requests").first();
  assert.equal(r.status, "uncertain");
  assert.equal(r.reserved, 0.1);
  assert.equal(r.cost, null);
});
test("generation merges concurrent study edits without overwriting them", async () => {
  const env = { DB: database(), OPENAI_API_KEY: "fake" };
  const initial = await load(env.DB);
  let release, started;
  const began = new Promise((r) => (started = r));
  const pending = generate(
    {
      requestId: "concurrent-generation",
      input: {
        topic: "Science",
        difficulty: "beginner",
        source: { filename: "", text: "" },
        formats: ["lesson"],
      },
    },
    env,
    () => {
      started();
      return new Promise((r) => (release = r));
    },
  );
  await began;
  initial.library.packs[0].flashcards.push(
    newCard("Manual", "Saved during generation"),
  );
  await env.DB.prepare(
    "UPDATE library SET data=?,revision=revision+1 WHERE id=1",
  )
    .bind(JSON.stringify(initial.library))
    .run();
  release(
    Response.json({
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 10 },
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ title: "Science", lesson: "A lesson" }),
            },
          ],
        },
      ],
    }),
  );
  assert.equal((await (await pending).json()).status, "succeeded");
  const final = await load(env.DB);
  assert.equal(final.library.packs.length, 2);
  assert.equal(final.library.packs[0].flashcards[0].front, "Manual");
});
