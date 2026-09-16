import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import worker, { generate } from "../worker/index.js";
import { database } from "./db.js";
const env = {
  DB: database(),
  LOCAL_DEV: "true",
  OPENAI_API_KEY: "test-only",
  ASSETS: {
    async fetch(request) {
      const relative = new URL(request.url).pathname;
      const file = path.resolve(
        "dist",
        "." + (relative === "/" ? "/index.html" : relative),
      );
      if (!file.startsWith(path.resolve("dist") + path.sep))
        return new Response("", { status: 404 });
      try {
        return new Response(await readFile(file), {
          headers: {
            "Content-Type": file.endsWith(".html")
              ? "text/html"
              : file.endsWith(".css")
                ? "text/css"
                : "text/javascript",
          },
        });
      } catch {
        return new Response("", { status: 404 });
      }
    },
  },
};
let calls = 0;
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request("http://127.0.0.1:4180" + req.url, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    let response;
    if (req.url === "/api/generate") {
      response = await generate(
        JSON.parse(body),
        env,
        async (_url, options) => {
          calls++;
          const payload = JSON.parse(options.body),
            input = JSON.parse(payload.input),
            out = { title: input.topic };
          if (input.formats?.includes("flashcards"))
            out.flashcards = Array.from({ length: 20 }, (_, i) => ({
              front: `Front ${i + 1}`,
              back: `Back ${i + 1}`,
            }));
          if (input.formats?.includes("quiz"))
            out.quiz = Array.from({ length: 20 }, (_, i) => ({
              topic: "Testing",
              prompt: `Question ${i + 1}`,
              options: ["A", "B", "C", "D"],
              correct: 0,
              explanation: "A is correct.",
            }));
          if (input.formats?.includes("recall"))
            out.recall = Array.from({ length: 5 }, (_, i) => ({
              prompt: `Recall ${i + 1}`,
              example: "Example answer",
            }));
          if (input.formats?.includes("lesson"))
            out.lesson =
              "A short lesson.\nWorked example: test your understanding.\nMisconception: more practice is not always better.";
          if (!input.formats)
            out.feedback = "Good start. Add a concrete example.";
          return Response.json({
            status: "completed",
            usage: { input_tokens: 100, output_tokens: 200 },
            output: [
              { content: [{ type: "output_text", text: JSON.stringify(out) }] },
            ],
          });
        },
      );
    } else if (req.url === "/test/calls") response = Response.json({ calls });
    else response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
});
server.listen(4180, "127.0.0.1");
