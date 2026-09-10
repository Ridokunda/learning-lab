# Learning Lab

A personal space to learn, revise, and practice across subjects. Create new quizzes with a low-cost AI model and keep separate progress for each quiz.

## Open the app

On Windows, double-click **Start Learning Lab.cmd**. It starts a local service and opens [Learning Lab](http://127.0.0.1:4173). Node.js 22 or newer is required; the launcher can also use the Node runtime bundled with Codex on this computer. No package installation is needed.

On other systems, run `node server.cjs` from this folder, then open `http://127.0.0.1:4173`.

## Generate questions

1. Select **Create quiz**.
2. Enter any subject, choose beginner/intermediate/advanced, and optionally add study notes.
3. Under **API connection**, enter an [OpenAI API key](https://platform.openai.com/api-keys). Your API project needs billing/credit and model access; a ChatGPT subscription does not supply API credit.
4. Select **Generate 20 questions**. The quiz is checked for structure and saved to **My quizzes**.
5. Answer all 20 questions and submit for your score, topic priorities, and explanations.

AI-generated content can contain mistakes. Structural checks do not establish factual accuracy. Check unfamiliar facts against trusted learning material.

## Cost and API behavior

The default model is **gpt-5-nano**, using the Responses API with structured JSON output and minimal reasoning. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-5-nano), checked 10 September 2026: **US $0.05 per million input tokens** and **US $0.40 per million output tokens**.

For example, 2,000 input tokens and 6,000 output tokens cost approximately **US $0.0025**. This is an illustration, not a quote for every quiz. Output usage includes reasoning tokens. Each request is capped at 12,000 output tokens, and input fields are length-limited. The success message estimates cost from the API's reported usage at these rates; provider billing is authoritative.

Only one generation runs at a time, with a short cooldown. There are no automatic retries. A failed or timed-out request can still incur provider charges, so retries are explicit. Generation requires internet access; practicing a saved quiz does not require OpenAI access.

## Keys and privacy

- A key entered in the app is held in that tab's memory and sent only through the local service to `api.openai.com`. It is not written to browser storage, reports, project files, or GitHub. Reloading the tab forgets it; **Forget session key** clears it immediately.
- Alternatively, copy `.env.example` to `.env`, add `OPENAI_API_KEY`, and restart the service. `.env` is ignored by Git and never served to the browser. This optional mode stores the key locally in plaintext; protect the file accordingly.
- The model receives the subject, difficulty, and notes you submit. Existing answers and other quizzes are not sent. API requests use `store: false`; this does not override the provider's other retention policies.
- The service listens only on `127.0.0.1`. It checks the request host, origin, and a per-launch token. It is a personal local app, not a multi-user public backend.
- **My quizzes** and answers are saved in this browser's local storage. Browser clearing, private browsing, changing the origin/port, or switching browser profiles can lose or separate progress. Moving from the original `file://` quiz to the local app does not transfer browser storage automatically.
- If storage is unavailable or full, the app shows a warning and keeps progress in the current tab where possible. Keep it open until you have recorded what you need.

## Included interview quiz

The original 120-question quiz remains available, with six groups of 20 and eight questions per topic. It covers data structures, algorithms, Big-O, OOP, databases/SQL, operating systems, networking, backend/web, software design, testing, Git, security, concurrency, system design, and cloud/DevOps.

Only submitted groups contribute to scores. Submitted answers are locked until you start a new attempt. Reports include total score, accuracy, per-group results, topic revision priorities, missed answers, and explanations. Text reports can be downloaded. Starting a new attempt resets only the active quiz.

`index.html` can still be opened directly for the original offline quiz. AI generation needs the local launcher; it never embeds an API key in a downloadable HTML file.

## Development

- `src/questions.cjs`: the original question bank.
- `src/quiz-template.html`: quiz library, generator form, scoring, reports, and local persistence.
- `index.html`: built standalone interface.
- `server.cjs`: local HTTP service and OpenAI integration.
- `start.cjs` / `Start Learning Lab.cmd`: Windows launcher.
- `test.cjs`: offline UI-state and scoring checks.
- `server.test.cjs`: API validation, error handling, cost calculation, and local security tests using simulated provider responses.

After changes, run:

```text
node build.cjs
node test.cjs
node --test server.test.cjs
```

See [TESTING.md](TESTING.md) for validation and its limits. Quizzes are stored locally, not synchronized to GitHub or other devices. Automatic attempt history and cross-device sync are not part of this version.
