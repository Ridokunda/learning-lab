# Validation

Validated on 10 September 2026.

## Repeatable checks

Run `node build.cjs`, `node test.cjs`, and `node --test server.test.cjs`. No packages need to be installed. Node.js 22 or newer is required for the local app.

The offline tests execute the JavaScript embedded in the actual HTML with a minimal DOM/storage harness. They cover:

- 120 unique starter questions, four choices each, six groups of 20, and eight questions per starter topic.
- Syntax and the absence of external assets or direct browser-to-provider API calls.
- Incomplete submissions, persisted answers, a mixed 108/120 attempt, and 0% and 100% attempts.
- Topic totals, submitted-only grading, locked answers, reports, reset, corrupt data, and blocked storage.
- Generated 20-question quizzes, library restoration, and independent progress when switching between the starter and generated quizzes.

The server tests use simulated provider responses; they make no paid API calls. All six tests passed:

- Model, output-token cap, strict structured output, and disabled response storage.
- Response parsing, preserved correct answers after shuffling, and usage-based cost estimates.
- Rejection of duplicate, incomplete, malformed, and refused responses.
- Sanitized authentication, rate-limit, and timeout errors; no automatic retries.
- Local host/origin/token checks, request validation, and blocked access to source files and secrets.
- Blocking a second generation while another is running.

## Browser checks

The real app was opened locally. A separate local test server supplied a clearly labeled fixture instead of contacting OpenAI, allowing the complete generation flow to be tested without an API key or charge:

- Create a quiz, enter a subject/difficulty, and generate 20 questions.
- Answer all 20 questions, submit, and open the report.
- Verify per-quiz totals and topic results, then switch to My quizzes.
- Reload and confirm the generated quiz and its score remain in the library.
- Simulate a provider rate-limit/billing error and verify existing quizzes remain intact.
- Return to the real app and confirm API-key setup is available.

The original quiz also passed browser checks for answer persistence, incomplete submission, wrong-answer explanations, reset confirmation, keyboard answering, and desktop/narrow layouts. Report text is covered by offline tests; the original browser download-event hook did not confirm download completion.

## Limits

No real OpenAI key was configured, so live provider access and the factual quality of generated quizzes have not been verified. Enter your key in the app to generate your first real quiz. API credit and model availability depend on your account.

The testing browser blocks direct `file://` navigation. Browser interaction tests used the same HTML served locally. This is functional validation, not exhaustive browser compatibility or a formal accessibility audit.
