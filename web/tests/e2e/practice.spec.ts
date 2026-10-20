import { expect, test } from "@playwright/test";

const topicId = "biology-sl:first-assessment-2025:unity-and-diversity";
const questionText = "State one function of the cell membrane.";
const markschemeText = "Accept: controls movement into and out of the cell.";
const answerText = "It controls movement into and out of the cell.";

async function seedPracticeData(page: import("@playwright/test").Page) {
  await page.addInitScript(({ topicId, questionText, markschemeText }) => {
    const request = indexedDB.open("ib-revision-studio", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const papers = db.createObjectStore("papers", { keyPath: "id" });
      papers.createIndex("subjectId", "subjectId");
      papers.createIndex("examSession", "examSession");
      papers.createIndex("syllabusVersion", "syllabusVersion");
      const documents = db.createObjectStore("documents", { keyPath: "id" });
      documents.createIndex("paperId", "paperId");
      documents.createIndex("kind", "kind");
      const questions = db.createObjectStore("questions", { keyPath: "id" });
      questions.createIndex("paperId", "paperId");
      questions.createIndex("status", "status");
      questions.createIndex("verified", "verified");
      questions.createIndex("topicIds", "topicIds", { multiEntry: true });
      const topics = db.createObjectStore("topics", { keyPath: "id" });
      topics.createIndex("subjectId", "subjectId");
      topics.createIndex("syllabusVersion", "syllabusVersion");
      topics.createIndex("[subjectId+syllabusVersion]", ["subjectId", "syllabusVersion"]);
      topics.createIndex("custom", "custom");
      db.createObjectStore("settings", { keyPath: "id" });
      const attempts = db.createObjectStore("attempts", { keyPath: "id" });
      attempts.createIndex("questionId", "questionId");
      attempts.createIndex("attemptedAt", "attemptedAt");
      attempts.createIndex("selfRating", "selfRating");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["papers", "documents", "questions", "settings"], "readwrite");
      const paper = {
        id: "e2e-practice-paper",
        subjectId: "biology-sl",
        examSession: "May 2026",
        component: "Paper 1",
        syllabusVersion: "first-assessment-2025",
        questionDocumentId: "e2e-question-paper",
        markschemeDocumentId: "e2e-markscheme",
        createdAt: "2026-10-20T00:00:00.000Z",
      };
      tx.objectStore("papers").put(paper);
      tx.objectStore("documents").put({
        id: "e2e-question-paper", paperId: paper.id, kind: "question-paper",
        fileName: "biology-paper.pdf", mimeType: "application/pdf", blob: new Blob(["paper"]), size: 5,
      });
      tx.objectStore("documents").put({
        id: "e2e-markscheme", paperId: paper.id, kind: "markscheme",
        fileName: "biology-markscheme.pdf", mimeType: "application/pdf", blob: new Blob(["markscheme"]), size: 10,
      });
      tx.objectStore("questions").put({
        id: "e2e-confirmed-question", paperId: paper.id, number: "1(a)", exactText: questionText,
        questionPages: [2], markschemeText, markschemePages: [5], topicIds: [topicId],
        verified: true, status: "confirmed",
      });
      tx.objectStore("questions").put({
        id: "e2e-unverified-question", paperId: paper.id, number: "1(b)",
        exactText: "This unverified question must not appear.", questionPages: [2],
        markschemeText: "Unverified markscheme.", markschemePages: [5], topicIds: [topicId],
        verified: false, status: "draft",
      });
      tx.objectStore("settings").put({
        id: "app", examSession: "May 2026",
        syllabusVersions: { "biology-sl": "first-assessment-2025" }, selectedModelId: "e2e-local-model",
      });
      tx.oncomplete = () => db.close();
    };
  }, { topicId, questionText, markschemeText });
}

test("practises confirmed paper questions with local feedback and saves only self-rating metadata", async ({ page }) => {
  await seedPracticeData(page);

  const feedbackRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/lmstudio/feedback") {
      feedbackRequests.push({ url: url.href, body: request.postDataJSON() as Record<string, unknown> });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          creditedPoints: ["Identifies controlled movement."],
          missingPoints: ["Does not mention selective permeability."],
          explanation: "Compare your wording with the official markscheme.",
          uncertainty: ["Check whether the point earns the available mark."],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("http://127.0.0.1:3000");
  await page.getByRole("button", { name: "Biology SL" }).click();
  await expect(page.getByRole("heading", { name: "Biology SL" })).toBeVisible();
  await page.getByRole("button", { name: "Start practice" }).click();

  await expect(page.getByText(questionText)).toBeVisible();
  await expect(page.getByText("Confirmed topic: Unity and diversity")).toBeVisible();
  await expect(page.getByText("This unverified question must not appear.")).toHaveCount(0);
  await expect(page.getByText(/May 2026/)).toBeVisible();
  await page.getByLabel("Type your answer").fill(answerText);
  await page.getByRole("button", { name: "Get local AI feedback" }).click();

  await expect(page.getByText("Compare your wording with the official markscheme.")).toBeVisible();
  expect(feedbackRequests).toHaveLength(1);
  expect(new URL(feedbackRequests[0].url).origin).toBe("http://127.0.0.1:3000");
  expect(feedbackRequests[0].url).toBe("http://127.0.0.1:3000/api/lmstudio/feedback");
  expect(feedbackRequests[0].body).toMatchObject({
    modelId: "e2e-local-model",
    questionText,
    answer: { text: answerText },
    markschemeText,
  });

  await page.getByRole("button", { name: "Reveal markscheme" }).click();
  await expect(page.getByText(markschemeText)).toBeVisible();
  await expect(page.getByText("Official markscheme")).toBeVisible();
  await page.getByRole("button", { name: "Good I could explain this confidently." }).click();
  await expect(page.getByRole("heading", { name: "Good work" })).toBeVisible();

  const savedAttempts = await page.evaluate(async () => {
    const request = indexedDB.open("ib-revision-studio");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction("attempts", "readonly");
      const getAll = tx.objectStore("attempts").getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
    db.close();
    return records;
  });
  expect(savedAttempts).toHaveLength(1);
  expect(savedAttempts[0]).toMatchObject({ questionId: "e2e-confirmed-question", answerMode: "typed", selfRating: "good" });
  expect(savedAttempts[0]).not.toHaveProperty("answerText");
  expect(savedAttempts[0]).not.toHaveProperty("images");
  expect(JSON.stringify(savedAttempts)).not.toContain(answerText);
});
