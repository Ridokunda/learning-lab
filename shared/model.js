import { z } from "zod";
import { createEmptyCard, fsrs, generatorParameters } from "ts-fsrs";
import bank from "../src/questions.cjs";

const text = (max = 6000) => z.string().trim().min(1).max(max);
export const formats = ["flashcards", "quiz", "lesson", "recall"];
export const questionSchema = z
  .object({
    id: text(100),
    topic: text(100),
    prompt: text(1600),
    options: z.array(text(700)).length(4),
    correct: z.number().int().min(0).max(3),
    explanation: text(2200),
    group: z.number().int().min(0).max(5).default(0),
  })
  .refine((q) => new Set(q.options).size === 4, "Options must be distinct");
const schedule = z.object({
  due: z.string().datetime(),
  stability: z.number().nonnegative(),
  difficulty: z.number().min(0).max(10),
  elapsed_days: z.number().nonnegative(),
  scheduled_days: z.number().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  learning_steps: z.number().int().nonnegative(),
  last_review: z.string().datetime().optional(),
});
export const cardSchema = z.object({
  id: text(100),
  front: text(2000),
  back: text(),
  schedule,
  reviews: z
    .array(
      z.object({
        id: text(100),
        at: z.string().datetime(),
        rating: z.number().int().min(1).max(4),
      }),
    )
    .max(5000),
});
const attemptSchema = z.object({
  id: text(100),
  at: z.string().datetime(),
  answers: z.record(z.string(), z.number().int().min(0).max(3)),
  questionIds: z.array(text(100)),
  score: z.number().int().nonnegative(),
});
const recallSchema = z.object({
  id: text(100),
  prompt: text(2000),
  example: text(),
  draft: z.string().max(6000).default(""),
  answers: z.array(
    z.object({
      id: text(100),
      at: z.string().datetime(),
      text: text(),
      assessment: z.enum(["Again", "Hard", "Good", "Easy"]).optional(),
      feedback: z.string().max(6000).optional(),
    }),
  ),
});
export const packSchema = z.object({
  id: text(100),
  title: text(180),
  topic: text(160),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archived: z.boolean(),
  source: z.object({
    filename: z.string().max(255),
    text: z.string().max(30000),
  }),
  flashcards: z.array(cardSchema).max(1000),
  quiz: z.array(questionSchema).max(120),
  lesson: z.string().max(20000),
  recall: z.array(recallSchema).max(100),
  attempts: z.array(attemptSchema).max(5000),
  draft: z.record(z.string(), z.number().int().min(0).max(3)),
  locked: z.array(text(100)).default([]),
  practiceDraft: z
    .record(z.string(), z.number().int().min(0).max(3))
    .default({}),
  cursor: z
    .object({ format: z.enum(formats), index: z.number().int().nonnegative() })
    .optional(),
});
export const librarySchema = z
  .object({
    version: z.literal(2),
    settings: z.object({
      monthlyBudget: z.number().min(0).max(1000),
      timezone: text(80),
    }),
    packs: z.array(packSchema).max(500),
    lastPack: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v.settings.timezone });
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid timezone" });
    }
    if (new Set(v.packs.map((p) => p.id)).size !== v.packs.length)
      ctx.addIssue({ code: "custom", message: "Duplicate pack IDs" });
    for (const p of v.packs) {
      for (const items of [p.flashcards, p.quiz, p.recall])
        if (new Set(items.map((i) => i.id)).size !== items.length)
          ctx.addIssue({ code: "custom", message: "Duplicate item IDs" });
      for (const [id, a] of Object.entries(p.draft))
        if (!p.quiz.some((q) => q.id === id))
          ctx.addIssue({ code: "custom", message: "Unknown draft question" });
    }
  });
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const emptyPack = (title = "Untitled pack") => ({
  id: id(),
  title,
  topic: title,
  difficulty: "beginner",
  createdAt: now(),
  updatedAt: now(),
  archived: false,
  source: { filename: "", text: "" },
  flashcards: [],
  quiz: [],
  lesson: "",
  recall: [],
  attempts: [],
  draft: {},
});
export function starterPack() {
  const p = emptyPack("Software engineering & computer science");
  p.id = "interview";
  for (let r = 0; r < 8; r++)
    Object.entries(bank).forEach(([topic, rows], t) => {
      const [prompt, a, b, c, d, explanation] = rows[r];
      const options = [a, b, c, d],
        offset = (r + t) % 4;
      for (let i = 0; i < offset; i++) options.unshift(options.pop());
      const n = p.quiz.length + 1;
      p.quiz.push({
        id: String(n),
        topic,
        prompt,
        options,
        correct: offset,
        explanation,
        group: Math.floor((n - 1) / 20),
      });
    });
  return p;
}
export const emptyLibrary = () => ({
  version: 2,
  settings: { monthlyBudget: 5, timezone: "Africa/Johannesburg" },
  packs: [starterPack()],
  lastPack: null,
});
export const newCard = (front, back) => ({
  id: id(),
  front,
  back,
  schedule: JSON.parse(JSON.stringify(createEmptyCard())),
  reviews: [],
});
const scheduler = fsrs(
  generatorParameters({ request_retention: 0.9, enable_fuzz: false }),
);
export function review(card, rating, requestId, at = new Date()) {
  if (card.reviews.some((r) => r.id === requestId)) return card;
  if (![1, 2, 3, 4].includes(rating)) throw Error("Invalid rating");
  const s = {
    ...card.schedule,
    due: new Date(card.schedule.due),
    last_review: card.schedule.last_review
      ? new Date(card.schedule.last_review)
      : undefined,
  };
  if (at < new Date(s.due))
    throw Error("This card is not due. Use free practice.");
  return {
    ...card,
    schedule: JSON.parse(JSON.stringify(scheduler.next(s, at, rating).card)),
    reviews: [...card.reviews, { id: requestId, at: at.toISOString(), rating }],
  };
}
export function monthKey(timezone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}
export function mixedItems(lib, at = new Date()) {
  const packs = lib.packs.filter((p) => !p.archived);
  const cards = packs.flatMap((p) =>
    p.flashcards
      .filter((c) => new Date(c.schedule.due) <= at)
      .map((c) => ({ packId: p.id, format: "flashcards", itemId: c.id })),
  );
  const missed = packs.flatMap((p) => {
    const latest = p.attempts.at(-1);
    return p.quiz
      .filter(
        (q) =>
          latest?.questionIds.includes(q.id) &&
          latest.answers[q.id] !== q.correct,
      )
      .map((q) => ({ packId: p.id, format: "quiz", itemId: q.id }));
  });
  const recall = packs.flatMap((p) =>
    p.recall.map((r) => ({ packId: p.id, format: "recall", itemId: r.id })),
  );
  return [...cards.slice(0, 20), ...missed.slice(0, 10), ...recall.slice(0, 5)];
}
export function migrateLegacy(data) {
  if (data?.version !== 1 || data?.kind !== "learning-lab-local")
    throw Error("Unsupported backup");
  const lib = emptyLibrary();
  lib.packs = [
    starterPack(),
    ...(data.quizzes || []).map((q) => ({
      ...emptyPack(q.title),
      id: q.id,
      quiz: q.questions.map((v) => ({ ...v, id: String(v.id) })),
    })),
  ];
  for (const p of lib.packs) {
    const s = data.progress?.[p.id];
    if (!s) continue;
    p.draft = Object.fromEntries(
      Object.entries(s.answers || {}).filter(
        ([k, v]) =>
          p.quiz.some((q) => q.id === k) &&
          Number.isInteger(v) &&
          v >= 0 &&
          v < 4,
      ),
    );
    const qs = p.quiz.filter((q) => s.submitted?.[q.group]);
    p.locked = qs.map((q) => q.id);
    if (qs.length)
      p.attempts.push({
        id: id(),
        at: now(),
        answers: { ...p.draft },
        questionIds: qs.map((q) => q.id),
        score: qs.filter((q) => p.draft[q.id] === q.correct).length,
      });
  }
  return librarySchema.parse(lib);
}
