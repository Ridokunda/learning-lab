import { test, expect } from "@playwright/test";
test("complete learning workflow, persistence and zero AI studying", async ({
  page,
  request,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make room for curiosity." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "+ Create a study pack" }).click();
  await page.getByLabel("Topic", { exact: true }).fill("Browser test pack");
  await page.getByRole("button", { name: "Generate & save pack" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser test pack" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByText("Back 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText("19 cards due")).toBeVisible();
  await page
    .getByRole("button", { name: "Free practice", exact: true })
    .click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(
    page.getByText("Free practice · schedule unchanged").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  const radios = page.locator('#quiz-form input[value="0"]');
  for (let i = 0; i < 20; i++) await radios.nth(i).check();
  await page.getByRole("button", { name: "Submit 20 answers" }).click();
  await expect(
    page.getByRole("heading", { name: "20 / 20 correct" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#quiz-form input").first()).toBeDisabled();
  await page.getByRole("button", { name: "Recall", exact: true }).click();
  await page
    .getByLabel("Write your answer before revealing the example")
    .fill("My draft survives reloading");
  await expect(page.locator("#status")).toHaveText("Saved");
  await page.reload();
  await expect(
    page.getByLabel("Write your answer before revealing the example"),
  ).toHaveValue("My draft survives reloading");
  await page.getByRole("button", { name: "Save & reveal example" }).click();
  await expect(page.getByText("Example answer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  expect((await (await request.get("/test/calls")).json()).calls).toBe(1);
  await page
    .getByRole("button", {
      name: "Request AI feedback (uses budget)",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Good start. Add a concrete example."),
  ).toBeVisible();
  expect((await (await request.get("/test/calls")).json()).calls).toBe(2);
  await page.getByRole("button", { name: "Add a flashcard" }).click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("Manually corrected fact");
  await page.getByLabel("Answer", { exact: true }).fill("My corrected answer");
  await page.getByRole("button", { name: "Save card" }).click();
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(
    second.getByRole("heading", { name: "Browser test pack" }),
  ).toBeVisible();
  await second.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(second.getByText("20 cards due")).toBeVisible();
  await context.close();
  await page.getByRole("link", { name: "Settings & backups" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export complete backup" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/learning-lab-backup/);
  expect(errors).toEqual([]);
});
test("mobile layout and document input boundaries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#create");
  await page.getByLabel("Choose a document (optional)").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Editable document notes"),
  });
  await expect(page.locator("#source")).toHaveValue("Editable document notes");
  await page.locator("#source").fill("x".repeat(30001));
  await page.getByLabel("Topic", { exact: true }).fill("Long text");
  await page.getByRole("button", { name: "Generate & save pack" }).click();
  await expect(page.getByRole("alert")).toContainText("30,000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".local/mobile.png", fullPage: true });
});

test("stale saves and expired login retain unsaved answers", async ({
  page,
  request,
}) => {
  await page.goto("/#pack/interview");
  await expect(
    page.getByRole("heading", {
      name: "Software engineering & computer science",
    }),
  ).toBeVisible();
  const current = await (await request.get("/api/library")).json();
  current.library.packs[0].title = "Changed on another device";
  const changed = await request.post("/api/save", {
    headers: { Origin: "http://127.0.0.1:4180" },
    data: { revision: current.revision, library: current.library },
  });
  expect(changed.status()).toBe(200);
  await page.locator("#quiz-form input").first().check();
  await expect(page.getByRole("alert")).toContainText("Another device");
  await expect(page.locator("#quiz-form input").first()).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Download unsaved work" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reload saved library" }).click();
  await expect(
    page.getByRole("heading", { name: "Changed on another device" }),
  ).toBeVisible();
  await page.route("**/api/save", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign in again to continue." }),
    }),
  );
  await page.locator("#quiz-form input").nth(1).check();
  await expect(page.getByRole("alert")).toContainText("Sign in again");
  await expect(page.locator("#quiz-form input").nth(1)).toBeChecked();
});
