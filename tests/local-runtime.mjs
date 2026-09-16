import assert from "node:assert/strict";
import { newCard } from "../shared/model.js";
const origin = "http://127.0.0.1:4181";
const call = async (path, body) => {
  const r = await fetch(origin + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};
const start = await call("library");
assert.equal(start.status, 200);
const library = start.data.library;
const card = newCard("Runtime test", "D1 persisted");
library.packs[0].flashcards.push(card);
const saved = await call("save", { revision: start.data.revision, library });
assert.equal(saved.status, 200);
const body = {
  revision: saved.data.revision,
  packId: "interview",
  cardId: card.id,
  requestId: crypto.randomUUID(),
  rating: 3,
};
const reviewed = await call("review", body);
assert.equal(reviewed.status, 200);
const repeated = await call("review", body);
assert.equal(repeated.status, 200);
assert.equal(repeated.data.revision, reviewed.data.revision);
const stale = await call("save", { revision: start.data.revision, library });
assert.equal(stale.status, 409);
const backup = (await call("export")).data;
backup.requests.push({
  id: "runtime-ledger-" + crypto.randomUUID(),
  fingerprint: "test",
  month: "2026-09",
  reserved: 0.01,
  cost: null,
  result: null,
  created_at: new Date().toISOString(),
  finished_at: null,
});
const restore = await call("import", {
  revision: reviewed.data.revision,
  backup,
});
assert.equal(restore.status, 200);
const complete = await call("export");
assert.equal(complete.data.requests.at(-1).status, "restored");
console.log(
  "PASS: actual workerd + D1 persistence, FSRS review, repeat submission, stale conflict, atomic restore and ledger import.",
);
