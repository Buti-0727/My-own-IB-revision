import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { RevisionDatabase } from "../../src/lib/storage/db";
import { createRepositories } from "../../src/lib/storage/repositories";
import type { PaperRecord, QuestionRecord, StoredDocument } from "../../src/lib/domain/types";

const testDatabases: RevisionDatabase[] = [];

function createTestDatabase() {
  const name = `revision-studio-test-${crypto.randomUUID()}`;
  const db = new RevisionDatabase(name);
  testDatabases.push(db);
  return { db, repositories: createRepositories(db) };
}

function makePaper(): PaperRecord {
  return {
    id: "paper-1",
    subjectId: "biology-sl",
    examSession: "May 2026",
    component: "Paper 1",
    questionDocumentId: "paper-pdf-1",
    markschemeDocumentId: "markscheme-pdf-1",
    syllabusVersion: "first-assessment-2025",
    createdAt: "2026-10-20T00:00:00.000Z",
  };
}

function makeDocument(id: string, kind: StoredDocument["kind"]): StoredDocument {
  return {
    id,
    paperId: "paper-1",
    kind,
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    blob: new Blob([`pdf-${id}`], { type: "application/pdf" }),
    size: 6,
  };
}

function makeQuestion(id: string): QuestionRecord {
  return {
    id,
    paperId: "paper-1",
    number: "1(a)",
    exactText: "State the function of the organelle.",
    questionPages: [2],
    markschemeText: "Accept: site of aerobic respiration.",
    markschemePages: [6],
    topicIds: ["biology-sl:first-assessment-2025:cell-respiration"],
    verified: false,
    status: "draft",
  };
}

afterEach(async () => {
  const databases = testDatabases.splice(0);
  databases.forEach((db) => db.close());
  await Promise.all(databases.map((db) => db.delete()));
});

describe("browser-local revision storage", () => {
  it("stores the full paper and matching markscheme as browser-local blobs", async () => {
    const { db, repositories } = createTestDatabase();
    const paper = makePaper();
    const questionPaper = makeDocument("paper-pdf-1", "question-paper");
    const markscheme = makeDocument("markscheme-pdf-1", "markscheme");

    await repositories.savePaperBundle({ paper, questionPaper, markscheme });

    await expect(db.papers.get("paper-1")).resolves.toMatchObject({ subjectId: "biology-sl" });
    await expect(db.documents.get("paper-pdf-1")).resolves.toMatchObject({
      kind: "question-paper",
      blob: questionPaper.blob,
    });
    await expect(db.documents.get("markscheme-pdf-1")).resolves.toMatchObject({
      kind: "markscheme",
      blob: markscheme.blob,
    });
  });

  it("never returns unverified questions from practice selection", async () => {
    const { repositories } = createTestDatabase();
    await repositories.savePaperBundle({
      paper: makePaper(),
      questionPaper: makeDocument("paper-pdf-1", "question-paper"),
      markscheme: makeDocument("markscheme-pdf-1", "markscheme"),
    });
    const draft = makeQuestion("question-draft");
    const readyToConfirm = makeQuestion("question-confirmed");
    await repositories.saveQuestion(draft);
    await repositories.saveQuestion(readyToConfirm);
    await repositories.confirmQuestion(readyToConfirm.id, {
      exactText: readyToConfirm.exactText,
      questionPages: readyToConfirm.questionPages,
      markschemeText: readyToConfirm.markschemeText,
      markschemePages: readyToConfirm.markschemePages,
      topicIds: readyToConfirm.topicIds,
    });

    await expect(repositories.listPracticeQuestions(
      "biology-sl",
      "biology-sl:first-assessment-2025:cell-respiration",
    )).resolves.toEqual([{
      ...readyToConfirm,
      verified: true,
      status: "confirmed",
    }]);
  });

  it("persists a self-rating without storing the submitted answer", async () => {
    const { db, repositories } = createTestDatabase();
    await repositories.savePaperBundle({
      paper: makePaper(),
      questionPaper: makeDocument("paper-pdf-1", "question-paper"),
      markscheme: makeDocument("markscheme-pdf-1", "markscheme"),
    });
    const question = makeQuestion("question-confirmed");
    await repositories.saveQuestion(question);
    await repositories.confirmQuestion(question.id, {
      exactText: question.exactText,
      questionPages: question.questionPages,
      markschemeText: question.markschemeText,
      markschemePages: question.markschemePages,
      topicIds: question.topicIds,
    });

    await repositories.saveAttempt({
      id: "attempt-1",
      questionId: "question-confirmed",
      attemptedAt: "2026-10-20T00:00:00.000Z",
      answerMode: "typed",
      selfRating: "hard",
    });

    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ questionId: "question-confirmed", selfRating: "hard" });
    expect(attempt).not.toHaveProperty("answer");
    expect(attempt).not.toHaveProperty("answerText");
    expect(attempt).not.toHaveProperty("images");
  });

  it("refuses to confirm a question without a matching markscheme reference", async () => {
    const { db, repositories } = createTestDatabase();
    const question = makeQuestion("question-draft");
    await repositories.savePaperBundle({
      paper: makePaper(),
      questionPaper: makeDocument("paper-pdf-1", "question-paper"),
      markscheme: makeDocument("markscheme-pdf-1", "markscheme"),
    });
    await repositories.saveQuestion(question);

    await expect(repositories.confirmQuestion(question.id, {
      exactText: question.exactText,
      questionPages: question.questionPages,
      markschemeText: " ",
      markschemePages: [],
      topicIds: question.topicIds,
    })).rejects.toThrow(/markscheme/i);
    await expect(db.questions.get(question.id)).resolves.toMatchObject({ verified: false, status: "draft" });
  });

  it("rejects a mismatched paper and markscheme pair before writing any records", async () => {
    const { db, repositories } = createTestDatabase();
    const incomplete = makeDocument("wrong-paper", "question-paper");

    await expect(repositories.savePaperBundle({
      paper: makePaper(),
      questionPaper: incomplete,
      markscheme: makeDocument("markscheme-pdf-1", "markscheme"),
    })).rejects.toThrow();

    await expect(db.papers.count()).resolves.toBe(0);
    await expect(db.documents.count()).resolves.toBe(0);
  });
});
