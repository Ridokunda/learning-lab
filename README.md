# Learning Lab

A personal space to learn, track progress, revise, and practice across subjects.

The first module is a self-contained software engineering and computer science interview quiz. Open **index.html** in a browser. No installation, server, account, or internet connection is needed.

## Interview practice

- 120 original multiple-choice questions in six groups of 20.
- 15 topics, with eight questions per topic: data structures, algorithms, Big-O, OOP, databases/SQL, operating systems, networking, backend/web, software design, testing, Git, security basics, concurrency, system design, and cloud/DevOps.
- Clickable and keyboard-accessible answers; individual group submission.
- Scores, accuracy, per-group results, topic revision priorities, and missed-answer explanations.
- Local browser progress and downloadable text reports for keeping a learning journal.
- A confirmed reset starts a new attempt. Download your report first to retain earlier results.

Only submitted groups contribute to scores. All 20 questions must be answered before submission. Submitted answers are locked for that attempt. Topic bands are revision prompts, not an assessment of interview readiness.

## Privacy and portability

The file makes no network requests and includes all scripts, styles, and question data. It stores progress using browser local storage, when available. Progress is browser/device-specific, can be cleared by browser settings, and may not follow the file when it moves. If storage is blocked, the quiz still works for the current session and displays a warning. Export a report to retain a portable record.

The public repository contains the quiz and source code, never your browser's answers. Downloaded reports can contain personal learning results; decide deliberately before publishing them.

## Project structure

- `index.html`: ready-to-use standalone quiz.
- `src/questions.cjs`: editable question bank.
- `src/quiz-template.html`: interface, scoring, and report logic.
- `build.cjs`: dependency-free builder; run `node build.cjs` after editing source.
- `TESTING.md`: validation performed for this version.

## Growing Learning Lab

Use this repository for additional subjects and learning tools. The current release provides the interview-practice module; a multi-subject dashboard, cross-device sync, and automatic history of attempts are future work, not current features. GitHub Issues can hold learning goals and requested modules. Keep private notes and reports outside this public repository unless you intend to share them.
