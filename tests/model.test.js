import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLibrary,
  librarySchema,
  newCard,
  review,
  migrateLegacy,
  monthKey,
  mixedItems,
} from "../shared/model.js";
import {
  inputSchema,
  outputSchema,
  parsePack,
  payload,
  reservation,
  parseResult,
  cost,
  provider,
} from "../worker/ai.js";
import worker, { authorize } from "../worker/index.js";

export const input = {
  topic: "Testing",
  difficulty: "beginner",
  source: { filename: "notes.txt", text: "Study notes" },
  formats: ["flashcards", "quiz", "lesson", "recall"],
};
export function fixture(formats = input.formats) {
  const raw = { title: "Testing" };
  if (formats.includes("flashcards"))
    raw.flashcards = Array.from({ length: 20 }, (_, i) => ({
      front: `Card ${i}`,
      back: "Answer",
    }));
  if (formats.includes("quiz"))
    raw.quiz = Array.from({ length: 20 }, (_, i) => ({
      topic: "Testing",
      prompt: `Question ${i}`,
      options: ["A", "B", "C", "D"],
      correct: i % 4,
      explanation: "Because this is the correct answer.",
    }));
  if (formats.includes("lesson"))
    raw.lesson = "Explanation\nWorked example\nCommon misconception";
  if (formats.includes("recall"))
    raw.recall = Array.from({ length: 5 }, (_, i) => ({
      prompt: `Recall ${i}`,
      example: "Example answer",
    }));
  return raw;
}
test("starter bank preserved, valid library and backup round trip", () => {
  const lib = librarySchema.parse(emptyLibrary());
  assert.equal(lib.packs[0].quiz.length, 120);
  assert.deepEqual(librarySchema.parse(JSON.parse(JSON.stringify(lib))), lib);
});
test("every format independently and together is validated", () => {
  for (const selected of [...input.formats.map((f) => [f]), input.formats]) {
    const p = parsePack(fixture(selected), { ...input, formats: selected });
    const lib = emptyLibrary();
    lib.packs.push(p);
    librarySchema.parse(lib);
    assert.deepEqual(Object.keys(outputSchema(selected).properties), [
      "title",
      ...selected,
    ]);
    for (const f of selected) assert.ok(p[f].length);
  }
});
test("rejects malformed and duplicate output and oversized input", () => {
  const raw = fixture();
  raw.quiz[1] = raw.quiz[0];
  assert.throws(() => parsePack(raw, input));
  assert.throws(() => parsePack({ title: "x" }, input));
  assert.throws(() =>
    inputSchema.parse({
      ...input,
      source: { filename: "x", text: "a".repeat(30001) },
    }),
  );
  assert.throws(() =>
    parseResult({
      status: "completed",
      output: [{ content: [{ type: "refusal" }] }],
    }),
  );
  assert.throws(() => parseResult({ status: "incomplete" }));
});
test("FSRS ratings schedule, repeated request is idempotent, practice input is immutable", () => {
  for (const rating of [1, 2, 3, 4]) {
    const card = newCard("Front", "Back"),
      at = new Date();
    const updated = review(card, rating, "review-one", at);
    assert.equal(updated.schedule.reps, 1);
    assert.ok(new Date(updated.schedule.due) > at);
    assert.equal(card.schedule.reps, 0);
    assert.deepEqual(review(updated, rating, "review-one", at), updated);
    assert.throws(() => review(updated, rating, "review-two", at));
  }
});
test("Johannesburg month boundary and invalid timezone", () => {
  assert.equal(
    monthKey("Africa/Johannesburg", new Date("2026-08-31T22:30:00Z")),
    "2026-09",
  );
  const lib = emptyLibrary();
  lib.settings.timezone = "invalid";
  assert.throws(() => librarySchema.parse(lib));
});
test("migration retains selected answers and graded groups", () => {
  const old = {
    kind: "learning-lab-local",
    version: 1,
    quizzes: [],
    progress: {
      interview: { answers: { 1: 2, 2: 1 }, submitted: [true, false] },
    },
  };
  const lib = migrateLegacy(old);
  assert.equal(lib.packs[0].draft["1"], 2);
  assert.equal(lib.packs[0].attempts[0].answers["2"], 1);
  assert.equal(lib.packs[0].attempts[0].questionIds.length, 20);
});
test("mixed practice prioritizes due cards then missed questions", () => {
  const lib = emptyLibrary(),
    p = lib.packs[0];
  p.flashcards.push(newCard("F", "B"));
  p.attempts.push({
    id: "a",
    at: new Date().toISOString(),
    answers: { 1: (p.quiz[0].correct + 1) % 4 },
    questionIds: ["1"],
    score: 0,
  });
  assert.deepEqual(
    mixedItems(lib).map((i) => i.format),
    ["flashcards", "quiz"],
  );
});
test("provider never retries and uses bounded structured requests", async () => {
  const body = payload(input);
  assert.equal(body.store, false);
  assert.equal(body.model, "gpt-5-nano");
  assert.ok(reservation(body) > 0.0064);
  assert.equal(
    cost({ usage: { input_tokens: 2000, output_tokens: 6000 } }),
    0.0025,
  );
  assert.equal(cost({}), null);
  let calls = 0;
  await assert.rejects(
    provider(body, "fake", async () => {
      calls++;
      return new Response("", { status: 429 });
    }),
  );
  assert.equal(calls, 1);
});
test("unauthenticated static and API requests fail closed", async () => {
  for (const path of ["/", "/assets/app.js", "/api/library", "/api/generate"]) {
    const r = await worker.fetch(
      new Request("https://example.workers.dev" + path),
      {
        ASSETS: {
          fetch() {
            throw Error("must not serve");
          },
        },
      },
    );
    assert.equal(r.status, 503);
  }
  await assert.rejects(
    authorize(new Request("https://example.workers.dev"), {
      LOCAL_DEV: "true",
      ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      ACCESS_AUD: "aud",
      ALLOWED_EMAIL: "a@example.com",
    }),
  );
  await authorize(new Request("http://127.0.0.1"), { LOCAL_DEV: "true" });
});
