import { z } from "zod";
import { emptyPack, id, newCard, questionSchema } from "../shared/model.js";
export const inputSchema = z.object({
  topic: z.string().trim().min(1).max(160),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  source: z.object({
    filename: z.string().max(255),
    text: z.string().max(30000),
  }),
  formats: z
    .array(z.enum(["flashcards", "quiz", "lesson", "recall"]))
    .min(1)
    .max(4),
});
import { payload, reservation } from "../shared/generation.js";
export { payload, reservation, outputSchema } from "../shared/generation.js";
export function parsePack(raw, input) {
  const p = emptyPack(z.string().trim().min(1).max(180).parse(raw.title));
  Object.assign(p, {
    topic: input.topic,
    difficulty: input.difficulty,
    source: input.source,
  });
  for (const f of input.formats) {
    if (f === "lesson") {
      p.lesson = z.string().trim().min(1).max(20000).parse(raw.lesson);
      continue;
    }
    const values = z
      .array(z.unknown())
      .length(f === "recall" ? 5 : 20)
      .parse(raw[f]);
    p[f] = values.map((q) =>
      f === "quiz"
        ? questionSchema.parse({ ...q, id: id(), group: 0 })
        : f === "flashcards"
          ? newCard(
              z.string().trim().min(1).max(2000).parse(q.front),
              z.string().trim().min(1).max(6000).parse(q.back),
            )
          : {
              id: id(),
              prompt: z.string().trim().min(1).max(2000).parse(q.prompt),
              example: z.string().trim().min(1).max(6000).parse(q.example),
              answers: [],
            },
    );
    const prompts = p[f].map((q) =>
      (q.prompt || q.front).toLowerCase().replace(/\s+/g, " "),
    );
    if (new Set(prompts).size !== prompts.length)
      throw Error("Duplicate generated items");
  }
  return p;
}
export async function provider(body, key, fetchImpl = fetch) {
  const r = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw Error(
      `OpenAI request failed (${r.status}). Retry only when ready; it may have incurred charges.`,
    );
  }
  const reader = r.body.getReader();
  let size = 0,
    output = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw Error("Provider response too large");
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  const result = JSON.parse(output + decoder.decode());
  return result;
}
export function parseResult(result) {
  if (result.output?.some((i) => i.content?.some((c) => c.type === "refusal")))
    throw Error("The model declined this request.");
  if (result.status !== "completed") throw Error("The model did not finish.");
  return JSON.parse(
    (result.output || [])
      .flatMap((i) => i.content || [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join(""),
  );
}
export function cost(result) {
  const u = result?.usage;
  return Number.isInteger(u?.input_tokens) &&
    u.input_tokens >= 0 &&
    Number.isInteger(u?.output_tokens) &&
    u.output_tokens >= 0
    ? (u.input_tokens * 0.05 + u.output_tokens * 0.4) / 1e6
    : null;
}
