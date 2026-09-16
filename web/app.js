import "./style.css";
import { payload, reservation } from "../shared/generation.js";
import { api, esc as e, download } from "./api.js";
import { extract } from "./documents.js";
import {
  emptyPack,
  newCard,
  id,
  now,
  formats,
  mixedItems,
  monthKey,
} from "../shared/model.js";

const app = document.querySelector("#app"),
  status = document.querySelector("#status");
let lib,
  revision,
  requests = [],
  busy = false,
  dirty = false,
  saveChain = Promise.resolve(),
  mixed = null,
  pendingSaveTimer = null,
  saveCount = 0;
function scheduleSave() {
  dirty = true;
  saveCount++;
  say("Saving…");
  clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    save().catch(() => {});
  }, 600);
}
async function flushSave() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
    await save();
  }
  await saveChain;
}
document.querySelector("nav").addEventListener("click", (event) => {
  if (busy) {
    event.preventDefault();
    say("Wait for the current request to finish.");
  }
});
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const say = (m) => {
  status.textContent = m;
};
const err = (error) => {
  say("Save or request failed");
  let box = $("#error");
  if (!box) {
    box = document.createElement("div");
    box.id = "error";
    box.className = "error";
    box.setAttribute("role", "alert");
    app.prepend(box);
  }
  box.textContent = error.message;
  if (lib && dirty) {
    const controls = document.createElement("div");
    controls.className = "row";
    const retry = document.createElement("button");
    retry.textContent = "Retry saving";
    retry.onclick = async () => {
      saveChain = Promise.resolve();
      try {
        await save();
        box.remove();
      } catch {}
    };
    const keep = document.createElement("button");
    keep.textContent = "Download unsaved work";
    keep.onclick = () =>
      download(
        { kind: "learning-lab", version: 2, library: lib, requests },
        "learning-lab-backup-unsaved.json",
      );
    const reload = document.createElement("button");
    reload.textContent = "Reload saved library";
    reload.onclick = async () => {
      if (
        !confirm(
          "Discard unsaved changes? Download them first if you need them.",
        )
      )
        return;
      try {
        clearTimeout(pendingSaveTimer);
        pendingSaveTimer = null;
        saveChain = Promise.resolve();
        await refresh();
        await route();
      } catch (error) {
        err(error);
      }
    };
    controls.append(retry, keep, reload);
    box.append(controls);
  }
};
const date = (v) =>
  new Date(v).toLocaleString("en-ZA", {
    timeZone: lib.settings.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
const button = (label, action, cls = "") =>
  `<button class="${cls}" data-action="${action}">${label}</button>`;
const field = (label, html) =>
  `<div class="field"><label>${label}${html}</label></div>`;
async function refresh() {
  const data = await api("library");
  lib = data.library;
  revision = data.revision;
  requests = data.requests;
  dirty = false;
}
async function save() {
  dirty = true;
  const ticket = ++saveCount;
  say("Saving…");
  const snapshot = structuredClone(lib);
  const task = saveChain.then(async () => {
    const result = await api("save", { revision, library: snapshot });
    revision = result.revision;
    if (ticket === saveCount && !pendingSaveTimer) {
      dirty = false;
      say("Saved");
    }
  });
  saveChain = task;
  try {
    await task;
  } catch (error) {
    err(error);
    throw error;
  }
}
function heading(k, title, desc = "") {
  return `<div class="eyebrow">${k}</div><h1>${title}</h1>${desc ? `<p class="muted intro">${desc}</p>` : ""}`;
}
function packCard(p) {
  return `<article class="card"><div>${formats
    .filter((f) => p[f]?.length)
    .map((f) => `<span class="tag">${f}</span>`)
    .join(
      "",
    )}</div><h2><a href="#pack/${e(p.id)}">${e(p.title)}</a></h2><p class="muted">${e(p.topic)} · ${e(p.difficulty)}</p><div class="row between"><small>${date(p.updatedAt)}</small><a class="button" href="#pack/${e(p.id)}">Open pack →</a></div></article>`;
}
function home() {
  const packs = lib.packs
    .filter((p) => !p.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const due = packs.reduce(
    (n, p) =>
      n +
      p.flashcards.filter((c) => new Date(c.schedule.due) <= new Date()).length,
    0,
  );
  const last = lib.packs.find((p) => p.id === lib.lastPack);
  app.innerHTML =
    heading(
      "Your personal learning space",
      "Make room for curiosity.",
      "Pick up a familiar topic or explore something new. Your library grows at your pace.",
    ) +
    `<section class="hero"><div class="eyebrow">${last ? "Continue learning" : "Start with what you know"}</div><h2>${e(last?.title || "A small step, a stronger understanding.")}</h2><p>${due} flashcards ready for review · ${packs.length} study packs</p><div class="row"><a class="button primary" href="${last ? "#pack/" + e(last.id) : "#create"}">${last ? "Continue studying" : "Create your first pack"} →</a><a class="button" href="#practice">Start mixed practice</a></div></section><div class="row between"><h2>Recently studied</h2><a href="#library">View library →</a></div><div class="grid">${packs.slice(0, 4).map(packCard).join("")}</div>`;
}
function library() {
  app.innerHTML =
    heading(
      "Collected knowledge",
      "Your library.",
      "Everything you create is saved here. Studying never calls AI.",
    ) +
    `<div class="toolbar"><input id="search" aria-label="Search title or topic" placeholder="Search title or topic…"><select id="filter" aria-label="Filter by format"><option value="">All formats</option>${formats.map((f) => `<option>${f}</option>`).join("")}</select><label class="check"><input id="archived" type="checkbox">Archived</label></div><div id="packs" class="grid"></div>`;
  const draw = () => {
    $("#packs").innerHTML =
      lib.packs
        .filter(
          (p) =>
            p.archived === $("#archived").checked &&
            (!$("#filter").value || p[$("#filter").value]?.length) &&
            `${p.title} ${p.topic}`
              .toLowerCase()
              .includes($("#search").value.toLowerCase()),
        )
        .map(packCard)
        .join("") || "<p>No matching packs.</p>";
  };
  $("#search").oninput = draw;
  $("#filter").onchange = draw;
  $("#archived").onchange = draw;
  draw();
}
function create(seed) {
  app.innerHTML =
    heading(
      "Follow your curiosity",
      "Create a study pack.",
      "Choose what to learn and how to practise. AI runs only when you press Generate.",
    ) +
    `<form id="create-form" class="panel">${field("Topic", `<input id="topic" required maxlength="160" value="${e(seed?.topic || "")}" placeholder="e.g. How computer networks work">`)}${field("Difficulty", `<select id="difficulty"><option>beginner</option><option>intermediate</option><option>advanced</option></select>`)}${field("Choose a document (optional)", `<input id="document" type="file" accept=".pdf,.docx,.txt"><small>Text-based PDF, DOCX or TXT · up to 10 MB. Only the text you select below is sent and saved.</small>`)}${field("Editable source preview", `<textarea id="source" rows="9" placeholder="Paste notes, or extract a document…">${e(seed?.source.text || "")}</textarea><small id="length">0 / 30,000 characters</small>`)}<p id="filename" class="muted">${e(seed?.source.filename || "")}</p><fieldset><legend>Learning formats</legend>${formats.map((f, i) => `<label class="check"><input type="checkbox" name="format" value="${f}" checked>${["20 flashcards", "20 quiz questions", "One short lesson with examples", "5 recall exercises"][i]}</label>`).join("")}</fieldset><p class="muted">gpt-5-nano · at most 16,000 output tokens. A conservative cost reservation is made against your monthly budget. Failed requests can still cost money; retries are manual.</p><div class="row"><button class="primary" id="generate" type="submit">Generate & save pack</button><button id="manual" type="button">Create empty pack for manual cards</button></div><p id="estimate" class="muted"></p><p id="generation-status" role="status"></p></form>`;
  let filename = seed?.source.filename || "",
    pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem("learning-lab.pending"));
  } catch {}
  $("#difficulty").value = seed?.difficulty || "beginner";
  const count = () => {
    const estimated = reservation(
      payload({
        topic: $("#topic").value,
        difficulty: $("#difficulty").value,
        source: { filename, text: $("#source").value },
        formats: $$("input[name=format]:checked").map((el) => el.value),
      }),
    );
    $("#estimate").textContent =
      "Maximum cost reserved for this request: US $" +
      estimated.toFixed(5) +
      ". Actual token usage and cost appear in Settings after completion.";
    $("#length").textContent =
      `${$("#source").value.length.toLocaleString()} / 30,000 characters${$("#source").value.length > 30000 ? " — select a shorter excerpt; nothing will be truncated." : ""}`;
  };
  count();
  $("#source").oninput = count;
  $("#topic").oninput = count;
  $("#difficulty").onchange = count;
  $$("input[name=format]").forEach((el) => (el.onchange = count));
  $("#document").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      say("Extracting text…");
      $("#source").value = await extract(file);
      filename = file.name;
      $("#filename").textContent = filename;
      count();
      say("Preview ready. Review and edit before generating.");
    } catch (error) {
      err(error);
    }
  };
  $("#manual").onclick = async () => {
    const p = emptyPack($("#topic").value.trim() || "My flashcards");
    lib.packs.push(p);
    await save();
    location.hash = "#pack/" + p.id;
  };
  $("#create-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    try {
      const input = {
        topic: $("#topic").value.trim(),
        difficulty: $("#difficulty").value,
        source: { filename, text: $("#source").value },
        formats: $$("input[name=format]:checked").map((el) => el.value),
      };
      if (input.source.text.length > 30000)
        throw Error("Select an excerpt of 30,000 characters or fewer.");
      if (!input.formats.length) throw Error("Select at least one format.");
      const fingerprint = JSON.stringify(input);
      if (!pending || pending.fingerprint !== fingerprint)
        pending = { fingerprint, requestId: id() };
      busy = true;
      $("#generate").disabled = true;
      $("#generation-status").textContent =
        "Generating and saving… You can recover this request from Settings if the connection is lost.";
      try {
        sessionStorage.setItem("learning-lab.pending", JSON.stringify(pending));
      } catch {}
      const result = await api("generate", {
        requestId: pending.requestId,
        input,
      });
      if (result.status === "succeeded") {
        sessionStorage.removeItem("learning-lab.pending");
        await refresh();
        location.hash = "#pack/" + JSON.parse(result.result).packId;
        say("Study pack saved");
      } else if (result.status === "running")
        throw Error(
          "This request is still running. Check Settings request history.",
        );
      else {
        pending = null;
        sessionStorage.removeItem("learning-lab.pending");
        throw Error(result.error + " You may explicitly retry with Generate.");
      }
    } catch (error) {
      err(error);
    } finally {
      busy = false;
      if ($("#generate")) $("#generate").disabled = false;
    }
  };
}
function pack(p) {
  app.innerHTML =
    heading("Study pack", e(p.title), `${e(p.topic)} · ${e(p.difficulty)}`) +
    `<div class="row">${button("Rename", "rename")}${button(p.archived ? "Restore from archive" : "Archive", "archive")}${button("Generate a separate version", "regenerate")}${button("Add a flashcard", "add")}</div><div class="tabs">${formats
      .filter((f) => p[f]?.length)
      .map((f) => button(f[0].toUpperCase() + f.slice(1), f))
      .join(
        "",
      )}</div><div id="study"></div><details><summary>Source material${p.source.filename ? " · " + e(p.source.filename) : ""}</summary><pre>${e(p.source.text || "No source notes saved.")}</pre></details>`;
  const f = p.cursor?.format || formats.find((f) => p[f]?.length);
  if (f) study(p, f, p.cursor?.index || 0);
  else
    $("#study").innerHTML =
      '<div class="panel">Add a flashcard to start this pack.</div>';
  app.onclick = async (event) => {
    const a = event.target.closest("[data-action]")?.dataset.action;
    if (!a) return;
    try {
      if (formats.includes(a)) {
        p.cursor = { format: a, index: 0 };
        await save();
        study(p, a, 0);
      } else if (a === "rename") {
        const title = prompt("Pack title", p.title);
        if (title?.trim()) {
          p.title = title.trim();
          p.updatedAt = now();
          await save();
          pack(p);
        }
      } else if (a === "archive") {
        p.archived = !p.archived;
        await save();
        pack(p);
      } else if (a === "regenerate") create(p);
      else if (a === "add") editCard(p);
    } catch (error) {
      err(error);
    }
  };
}
function editCard(p, card) {
  const area = $("#study");
  area.innerHTML = `<form id="card-form" class="panel"><h2>${card ? "Edit" : "Add"} flashcard</h2>${field("Question", `<textarea id="front" maxlength="2000" required>${e(card?.front || "")}</textarea>`)}${field("Answer", `<textarea id="back" maxlength="6000" required>${e(card?.back || "")}</textarea>`)}<button class="primary">Save card</button></form>`;
  $("#card-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      if (card) {
        card.front = $("#front").value.trim();
        card.back = $("#back").value.trim();
      } else
        p.flashcards.push(
          newCard($("#front").value.trim(), $("#back").value.trim()),
        );
      p.updatedAt = now();
      await save();
      pack(p);
    } catch (error) {
      err(error);
    } finally {
      busy = false;
    }
  };
}
function study(p, format, index = 0, mode = "scheduled", onlyIds = null) {
  if (format === "lesson") {
    $("#study").innerHTML =
      `<article class="panel prose">${e(p.lesson)}</article>`;
    return;
  }
  if (format === "quiz") {
    quiz(p, onlyIds);
    return;
  }
  if (format === "recall") {
    recall(p, index);
    return;
  }
  const cards = onlyIds
    ? p.flashcards.filter((c) => onlyIds.includes(c.id))
    : mode === "free"
      ? p.flashcards
      : p.flashcards.filter((c) => new Date(c.schedule.due) <= new Date());
  const card = cards[Math.min(index, cards.length - 1)];
  $("#study").innerHTML =
    `<div class="row between"><p>${mode === "free" ? "Free practice · schedule unchanged" : `${cards.length} cards due`}</p><button id="practice-mode">${mode === "free" ? "Scheduled reviews" : "Free practice"}</button></div>${card ? `<div class="panel study-card"><div class="eyebrow">Flashcard ${Math.min(index + 1, cards.length)} / ${cards.length}</div><h2>${e(card.front)}</h2><button id="reveal" class="primary">Reveal answer</button><div id="card-answer" hidden><div class="answer">${e(card.back)}</div><p>How well did you remember?</p><div class="row">${["Again", "Hard", "Good", "Easy"].map((label, i) => `<button data-rating="${i + 1}">${label}</button>`).join("")}</div></div></div><p><button id="edit-card">Edit this card</button></p>` : '<div class="panel"><h2>You’re all caught up.</h2><p>Come back when more cards are due, or use free practice.</p></div>'}`;
  $("#practice-mode").onclick = () =>
    study(p, format, 0, mode === "free" ? "scheduled" : "free");
  if (!card) return;
  $("#reveal").onclick = () => {
    $("#card-answer").hidden = false;
    $("#reveal").hidden = true;
  };
  $("#edit-card").onclick = () => editCard(p, card);
  $$("[data-rating]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (busy) return;
        busy = true;
        try {
          if (mode === "free") {
            study(p, format, (index + 1) % cards.length, mode);
            say("Free practice · schedule unchanged");
            return;
          }
          say("Saving review…");
          const result = await api("review", {
            revision,
            packId: p.id,
            cardId: card.id,
            rating: Number(b.dataset.rating),
            requestId: id(),
          });
          lib = result.library;
          revision = result.revision;
          say("Review saved");
          if (mixed) {
            nextMixed();
            return;
          }
          pack(lib.packs.find((v) => v.id === p.id));
        } catch (error) {
          err(error);
        } finally {
          busy = false;
        }
      }),
  );
}
function quiz(p, onlyIds = null) {
  let qs = onlyIds ? p.quiz.filter((q) => onlyIds.includes(q.id)) : p.quiz;
  if (!p.practiceDraft) p.practiceDraft = {};
  let answers = onlyIds ? p.practiceDraft : p.draft;
  let group = !onlyIds ? Math.min(5, p.cursor?.index || 0) : 0;
  const draw = () => {
    const selected = onlyIds ? qs : qs.filter((q) => q.group === group);
    const locked = !onlyIds && selected.every((q) => p.locked?.includes(q.id));
    $("#study").innerHTML =
      `<div class="row between"><h2>Quiz practice</h2><div><button id="missed">Practise missed questions</button> <button id="new-attempt">New attempt</button></div></div>${!onlyIds && p.quiz.length > 20 ? `<label>Question group<select id="quiz-group">${[...new Set(p.quiz.map((q) => q.group))].map((g) => `<option value="${g}">Group ${g + 1}</option>`).join("")}</select></label>` : ""}<form id="quiz-form">${selected.map((q, i) => `<fieldset class="panel"><legend>${i + 1}. ${e(q.prompt)}</legend>${q.options.map((o, n) => `<label class="choice"><input ${locked ? "disabled" : ""} required type="radio" name="q-${e(q.id)}" value="${n}" ${answers[q.id] === n ? "checked" : ""}>${e(o)}</label>`).join("")}</fieldset>`).join("")}<p><button class="primary" ${selected.length && !locked ? "" : "disabled"}>Submit ${selected.length} answers</button></p></form><div id="results">${locked ? selected.map((q) => `<div class="panel ${answers[q.id] === q.correct ? "correct" : "wrong"}"><strong>${e(q.prompt)}</strong><p>Correct answer: ${e(q.options[q.correct])}</p><p>${e(q.explanation)}</p></div>`).join("") : ""}</div><details><summary>Attempt history (${p.attempts.length})</summary>${
        p.attempts
          .slice()
          .reverse()
          .map(
            (a) =>
              `<p>${date(a.at)} · ${a.score}/${a.questionIds.length} correct (${Math.round((100 * a.score) / a.questionIds.length)}%)</p>`,
          )
          .join("") || "<p>No attempts yet.</p>"
      }</details>`;
    if ($("#quiz-group")) {
      $("#quiz-group").value = group;
      $("#quiz-group").onchange = (ev) => {
        group = Number(ev.target.value);
        p.cursor = { format: "quiz", index: group };
        save()
          .then(draw)
          .catch(() => {});
      };
    }
    $("#new-attempt").onclick = async () => {
      if (onlyIds) p.practiceDraft = {};
      else p.draft = {};
      answers = onlyIds ? p.practiceDraft : p.draft;
      if (!onlyIds) p.locked = [];
      await save();
      draw();
    };
    $("#missed").onclick = () => {
      const last = p.attempts.at(-1);
      if (!last) {
        say("Submit an attempt first");
        return;
      }
      quiz(
        p,
        last.questionIds.filter(
          (qid) =>
            last.answers[qid] !== p.quiz.find((q) => q.id === qid)?.correct,
        ),
      );
    };
    $("#quiz-form").onchange = async (event) => {
      answers[event.target.name.slice(2)] = Number(event.target.value);
      p.updatedAt = now();
      try {
        await save();
      } catch {}
    };
    $("#quiz-form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      try {
        await saveChain;
        const a = {
          id: id(),
          at: now(),
          answers: { ...answers },
          questionIds: selected.map((q) => q.id),
          score: selected.filter((q) => answers[q.id] === q.correct).length,
        };
        p.attempts.push(a);
        if (!onlyIds)
          p.locked = [...new Set([...(p.locked || []), ...a.questionIds])];
        await save();
        $$("#quiz-form input").forEach((el) => (el.disabled = true));
        $("#quiz-form button").disabled = true;
        $("#results").innerHTML =
          `<div class="notice"><h2>${a.score} / ${selected.length} correct</h2><p>Attempt saved · ${Math.round((a.score / selected.length) * 100)}%</p></div>${selected.map((q) => `<div class="panel ${a.answers[q.id] === q.correct ? "correct" : "wrong"}"><strong>${e(q.prompt)}</strong><p>Your answer: ${e(q.options[a.answers[q.id]])}</p><p>Correct answer: ${e(q.options[q.correct])}</p><p>${e(q.explanation)}</p></div>`).join("")}${mixed ? '<button id="mixed-next">Continue session →</button>' : ""}`;
        if ($("#mixed-next")) $("#mixed-next").onclick = nextMixed;
      } catch (error) {
        err(error);
      } finally {
        busy = false;
      }
    };
  };
  draw();
}
function recall(p, index) {
  const item = p.recall[index % p.recall.length];
  if (!item) {
    $("#study").innerHTML = "<p>No recall exercises.</p>";
    return;
  }
  $("#study").innerHTML =
    `<div class="panel"><div class="eyebrow">Recall ${index + 1} / ${p.recall.length}</div><h2>${e(item.prompt)}</h2><form id="recall-form">${field("Write your answer before revealing the example", `<textarea id="recall-answer" maxlength="6000" required>${e(item.draft || "")}</textarea>`)}<button class="primary">Save & reveal example</button></form><div id="example"></div><button id="next-recall">Next exercise →</button></div><details open><summary>Saved answers & feedback (${item.answers.length})</summary>${item.answers
      .slice()
      .reverse()
      .map(
        (a) =>
          `<div class="panel"><small>${date(a.at)} · ${e(a.assessment || "Not rated")}</small><p class="prose">${e(a.text)}</p>${a.feedback ? `<div class="answer">${e(a.feedback)}</div>` : `<button data-feedback="${e(a.id)}">Request AI feedback (uses budget)</button>`}</div>`,
      )
      .join("")}</details>`;
  $("#recall-answer").oninput = () => {
    item.draft = $("#recall-answer").value;
    scheduleSave();
  };
  $("#next-recall").onclick = () => {
    if (mixed) nextMixed();
    else {
      p.cursor = { format: "recall", index: (index + 1) % p.recall.length };
      save()
        .then(() => recall(p, p.cursor.index))
        .catch(() => {});
    }
  };
  $("#recall-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await flushSave();
      const answer = {
        id: id(),
        at: now(),
        text: $("#recall-answer").value.trim(),
      };
      if (!answer.text) return;
      item.answers.push(answer);
      item.draft = "";
      await save();
      $("#recall-form button").disabled = true;
      $("#example").innerHTML =
        `<div class="answer">${e(item.example)}</div><p>Self-assess for free</p><div class="row">${["Again", "Hard", "Good", "Easy"].map((s) => `<button data-assessment="${s}">${s}</button>`).join("")}</div><p><button id="feedback-now">Request AI feedback (uses budget)</button></p>`;
      $$("[data-assessment]").forEach(
        (b) =>
          (b.onclick = async () => {
            answer.assessment = b.dataset.assessment;
            await save();
            say("Self-assessment saved");
          }),
      );
      $("#feedback-now").onclick = () => feedback(p, item, answer, index);
    } catch (error) {
      err(error);
    } finally {
      busy = false;
    }
  };
  $$("[data-feedback]").forEach(
    (b) =>
      (b.onclick = () =>
        feedback(
          p,
          item,
          item.answers.find((a) => a.id === b.dataset.feedback),
          index,
        )),
  );
}
async function feedback(p, item, answer, index) {
  if (busy) return;
  busy = true;
  say("Requesting feedback…");
  try {
    await flushSave();
    const storageKey = "learning-lab.feedback." + answer.id;
    let requestId = sessionStorage.getItem(storageKey) || id();
    sessionStorage.setItem(storageKey, requestId);
    const result = await api("generate", {
      kind: "feedback",
      requestId,
      packId: p.id,
      itemId: item.id,
      answerId: answer.id,
    });
    if (result.status !== "running") sessionStorage.removeItem(storageKey);
    if (result.status !== "succeeded")
      throw Error(
        result.error || "Feedback is still processing. Check request history.",
      );
    await refresh();
    const freshPack = lib.packs.find((v) => v.id === p.id);
    pack(freshPack);
    recall(freshPack, index);
    say("Feedback saved");
  } catch (error) {
    err(error);
  } finally {
    busy = false;
  }
}
function practice() {
  const items = mixedItems(lib);
  app.innerHTML =
    heading(
      "A little of everything",
      "Mixed practice.",
      "A roughly 30-minute session, using only your saved material. Due flashcards come first, followed by missed quiz questions and recall.",
    ) +
    `<div class="panel"><p>${items.length} activities available. You can stop whenever you like; completed work is saved.</p><button id="start-mixed" class="primary" ${items.length ? "" : "disabled"}>Start session</button></div>`;
  $("#start-mixed").onclick = () => {
    mixed = { items, index: 0, started: Date.now() };
    drawMixed();
  };
}
function nextMixed() {
  mixed.index++;
  drawMixed();
}
function drawMixed() {
  if (
    mixed.index >= mixed.items.length ||
    Date.now() - mixed.started >= 1800000
  ) {
    app.innerHTML = heading(
      "Session complete",
      "Time well spent.",
      "Your completed work is saved. Take a break or start another session.",
    );
    mixed = null;
    return;
  }
  const item = mixed.items[mixed.index],
    p = lib.packs.find((p) => p.id === item.packId);
  app.innerHTML =
    heading(
      "Mixed practice",
      e(p.title),
      `Activity ${mixed.index + 1} / ${mixed.items.length}`,
    ) + `<button id="skip">Skip activity</button><div id="study"></div>`;
  $("#skip").onclick = nextMixed;
  study(
    p,
    item.format,
    item.format === "recall"
      ? p.recall.findIndex((r) => r.id === item.itemId)
      : 0,
    "scheduled",
    [item.itemId],
  );
}
function settings() {
  const month = monthKey(lib.settings.timezone),
    spent = requests
      .filter((r) => r.month === month)
      .reduce((s, r) => s + (r.cost ?? r.reserved), 0);
  app.innerHTML =
    heading(
      "Your preferences",
      "Settings & backups.",
      "Your OpenAI key stays on the server. Backups contain learning material and progress, never the key.",
    ) +
    `<div class="panel"><h2>AI usage · ${month}</h2><p><span class="count">$${spent.toFixed(4)}</span> / $${lib.settings.monthlyBudget.toFixed(2)} reserved or used</p><p class="muted">Estimated USD at $0.05 / million input tokens and $0.40 / million output tokens. Uncertain requests keep their reservation. This budget covers this app only.</p><form id="settings-form">${field("Monthly app budget (USD)", `<input id="budget" type="number" min="0" max="1000" step="0.01" value="${lib.settings.monthlyBudget}" required>`)}${field("Timezone", `<input id="timezone" value="${e(lib.settings.timezone)}" required>`)}<button class="primary">Save settings</button></form></div><section class="panel"><h2>Backups & migration</h2><p>Export before restoring. Restore replaces the library and progress; existing cost history is retained.</p><div class="row"><button id="export">Export complete backup</button><button id="reload">Reload saved library</button></div>${field("Restore a JSON backup", '<input id="import-file" type="file" accept=".json">')}<p class="muted">For the old local app, use its Export for hosted app button in the same browser and origin where you studied.</p></section><section class="panel"><h2>Generation history</h2><p class="muted">Reload to check requests after a connection loss. A request marked running remains reserved and blocks further AI calls until its outcome is checked by the administrator.</p><div class="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>USD</th><th>Result</th></tr></thead><tbody>${requests
      .map((r) => {
        let result;
        try {
          result = JSON.parse(r.result);
        } catch {}
        return `<tr><td>${date(r.created_at)}</td><td>${e(r.status)}</td><td>${(r.cost ?? r.reserved).toFixed(5)}</td><td>${result?.packId ? `<a href="#pack/${e(result.packId)}">Open pack</a>` : e(r.error || "Processing")}${r.status === "running" && Date.now() - new Date(r.created_at).getTime() > 600000 ? `<button data-resolve="${e(r.id)}">Mark interrupted (keep reservation)</button>` : ""}</td></tr>`;
      })
      .join("")}</tbody></table></div></section>`;
  $$("[data-resolve]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !confirm(
            "Mark this request interrupted? Its full cost reservation stays in your budget. Check provider usage before explicitly retrying.",
          )
        )
          return;
        try {
          await api("resolve", { requestId: b.dataset.resolve });
          await refresh();
          settings();
        } catch (error) {
          err(error);
        }
      }),
  );
  $("#settings-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      new Intl.DateTimeFormat("en", { timeZone: $("#timezone").value });
      lib.settings = {
        monthlyBudget: Number($("#budget").value),
        timezone: $("#timezone").value,
      };
      await save();
      settings();
    } catch (error) {
      err(error);
    }
  };
  $("#export").onclick = async () => {
    try {
      download(
        await (async () => {
          await flushSave();
          return api("export");
        })(),
        "learning-lab-backup-" + now().slice(0, 10) + ".json",
      );
    } catch (error) {
      err(error);
    }
  };
  $("#reload").onclick = async () => {
    if (dirty && !confirm("Discard unsaved changes and reload?")) return;
    saveChain = Promise.resolve();
    await refresh();
    settings();
    say("Loaded saved library");
  };
  $("#import-file").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 10000000)
        throw Error("Backup exceeds the 10 MB import limit.");
      const backup = JSON.parse(await file.text());
      if (
        !confirm(
          "Replace your library with this backup? Export your current library first.",
        )
      )
        return;
      await api("import", { revision, backup });
      saveChain = Promise.resolve();
      await refresh();
      settings();
      say("Backup restored");
    } catch (error) {
      err(error);
    }
  };
}
async function route() {
  if (!lib) return;
  try {
    await flushSave();
  } catch {
    return;
  }
  app.onclick = null;
  const [page, packId] = location.hash.slice(1).split("/");
  $$("nav a").forEach((a) =>
    a.setAttribute(
      "aria-current",
      a.hash === "#" + (page || "home") ? "page" : "false",
    ),
  );
  if (page !== "practice") mixed = null;
  try {
    if (page === "library") library();
    else if (page === "create") create();
    else if (page === "settings") settings();
    else if (page === "practice") practice();
    else if (page === "pack") {
      const p = lib.packs.find((p) => p.id === packId);
      if (!p) throw Error("This pack was not found.");
      lib.lastPack = p.id;
      p.updatedAt = now();
      await save();
      pack(p);
    } else home();
    app.focus();
  } catch (error) {
    err(error);
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (event) => {
  if (dirty || busy) {
    event.preventDefault();
    event.returnValue = "";
  }
});
refresh()
  .then(route)
  .catch((error) => {
    app.innerHTML = heading(
      "Learning Lab",
      "Your library is private.",
      "Sign in to continue, or check the server configuration.",
    );
    err(error);
  });
