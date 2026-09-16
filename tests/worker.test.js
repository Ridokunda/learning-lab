import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./db.js";
import worker, { generate, load } from "../worker/index.js";
import { newCard, emptyLibrary } from "../shared/model.js";
const input = {
  topic: "Maths",
  difficulty: "beginner",
  source: { filename: "", text: "" },
  formats: ["lesson"],
};
const success = () =>
  new Response(
    JSON.stringify({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 100 },
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                title: "Maths",
                lesson: "Examples and misconceptions",
              }),
            },
          ],
        },
      ],
    }),
  );
const setup = () => ({
  DB: database(),
  LOCAL_DEV: "true",
  OPENAI_API_KEY: "fake",
});
const req = (path, body, headers = {}) =>
  new Request("http://127.0.0.1/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: "http://127.0.0.1",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
test("successful generation persisted, deduplicated, and bound to input", async () => {
  const env = setup();
  let calls = 0;
  const call = async () => {
    calls++;
    return success();
  };
  const body = { requestId: "generation-one", input };
  let r = await generate(body, env, call);
  assert.equal((await r.json()).status, "succeeded");
  r = await generate(body, env, call);
  assert.equal((await r.json()).status, "succeeded");
  assert.equal(calls, 1);
  assert.equal((await load(env.DB)).library.packs.length, 2);
  await assert.rejects(
    generate({ ...body, input: { ...input, topic: "Different" } }, env, call),
    /different input/,
  );
});
test("AI requests serialized across devices and budget enforced atomically", async () => {
  const env = setup();
  await load(env.DB);
  let finish, started;
  const began = new Promise((r) => (started = r));
  const first = generate({ requestId: "generation-one", input }, env, () => {
    started();
    return new Promise((r) => (finish = r));
  });
  await began;
  await assert.rejects(
    generate({ requestId: "generation-two", input }, env, success),
    /already running/,
  );
  finish(success());
  await first;
  const current = await load(env.DB);
  current.library.settings.monthlyBudget = 0;
  await env.DB.prepare("UPDATE library SET data=? WHERE id=1")
    .bind(JSON.stringify(current.library))
    .run();
  await assert.rejects(
    generate({ requestId: "generation-three", input }, env, success),
    /budget/,
  );
});
test("failed, malformed, refused and uncertain requests keep records; never retry", async () => {
  for (const provider of [
    () => {
      throw Error("Timeout");
    },
    () => new Response("{}"),
    () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ content: [{ type: "refusal" }] }],
        }),
      ),
    () =>
      new Response(
        JSON.stringify({
          status: "completed",
          usage: { input_tokens: 50, output_tokens: 20 },
          output: [
            { content: [{ type: "output_text", text: "invalid json" }] },
          ],
        }),
      ),
  ]) {
    const env = setup();
    let calls = 0;
    const body = { requestId: "generation-one", input };
    const r = await generate(body, env, async () => {
      calls++;
      return provider();
    });
    const record = await r.json();
    assert.equal(record.status, "failed");
    assert.ok(record.reserved > 0);
    await generate(body, env, provider);
    assert.equal(calls, 1);
    assert.equal((await load(env.DB)).library.packs.length, 1);
  }
});
test("database write failure cannot report generation success", async () => {
  const env = setup();
  await load(env.DB);
  env.DB.batch = async () => {
    throw Error("D1 quota exhausted");
  };
  const r = await generate(
    { requestId: "generation-one", input },
    env,
    success,
  );
  assert.equal((await r.json()).status, "failed");
  assert.equal((await load(env.DB)).library.packs.length, 1);
});
test("ordinary reading and saving uses no provider and stale saves rejected", async () => {
  const env = setup();
  let response = await worker.fetch(req("library"), env);
  const initial = await response.json();
  assert.equal(initial.revision, 0);
  initial.library.packs[0].draft["1"] = 2;
  response = await worker.fetch(
    req("save", { revision: 0, library: initial.library }),
    env,
  );
  assert.equal(response.status, 200);
  response = await worker.fetch(
    req("save", { revision: 0, library: initial.library }),
    env,
  );
  assert.equal(response.status, 409);
  response = await worker.fetch(
    req(
      "save",
      { revision: 1, library: initial.library },
      { Origin: "https://evil.example" },
    ),
    env,
  );
  assert.equal(response.status, 403);
  assert.equal((await load(env.DB)).library.packs[0].draft["1"], 2);
});
test("export restore preserves cards, answers, and ledger without resetting spend", async () => {
  const env = setup();
  await generate({ requestId: "generation-one", input }, env, success);
  const before = await load(env.DB);
  before.library.packs[0].flashcards.push(newCard("Question", "Answer"));
  await worker.fetch(
    req("save", { revision: before.revision, library: before.library }),
    env,
  );
  const backup = await (await worker.fetch(req("export"), env)).json();
  const other = setup();
  await load(other.DB);
  const imported = await worker.fetch(
    req("import", { revision: 0, backup }),
    other,
  );
  assert.equal(imported.status, 200);
  assert.deepEqual((await imported.json()).library, backup.library);
  assert.equal(
    (await other.DB.prepare("SELECT * FROM ai_requests").all()).results.length,
    1,
  );
  const current = await load(env.DB);
  const blank = {
    kind: "learning-lab",
    version: 2,
    library: emptyLibrary(),
    requests: [],
  };
  await worker.fetch(
    req("import", { revision: current.revision, backup: blank }),
    env,
  );
  assert.equal(
    (await env.DB.prepare("SELECT * FROM ai_requests").all()).results.length,
    1,
  );
});
