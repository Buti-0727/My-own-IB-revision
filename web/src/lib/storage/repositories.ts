import type { SubjectId } from "../domain/types";
import type {
  AppSettingsRecord,
  AttemptRecord,
  PaperBundle,
  PaperRecord,
  QuestionConfirmation,
  QuestionRecord,
  SelfRating,
  StorageEstimate,
  StoredDocument,
  TopicDefinition,
} from "../domain/types";
import { RevisionDatabase } from "./db";

export class StorageCapacityError extends Error {
  constructor() {
    super("Browser storage is full. Export a backup or remove an unused paper, then try again.");
    this.name = "StorageCapacityError";
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

function withStorageError<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    if (isQuotaError(error)) throw new StorageCapacityError();
    throw error;
  });
}

function assertPaperBundle(bundle: PaperBundle) {
  const { paper, questionPaper, markscheme } = bundle;
  if (questionPaper.paperId !== paper.id || markscheme.paperId !== paper.id) {
    throw new Error("Both PDF files must belong to the same paper record.");
  }
  if (
    questionPaper.id !== paper.questionDocumentId ||
    questionPaper.kind !== "question-paper" ||
    markscheme.id !== paper.markschemeDocumentId ||
    markscheme.kind !== "markscheme"
  ) {
    throw new Error("Choose the question paper and its matching markscheme.");
  }
  if (
    questionPaper.mimeType !== "application/pdf" ||
    markscheme.mimeType !== "application/pdf" ||
    questionPaper.size <= 0 ||
    markscheme.size <= 0
  ) {
    throw new Error("Both documents must be non-empty PDF files.");
  }
}

function assertConfirmation(confirmation: QuestionConfirmation) {
  if (!confirmation.exactText.trim()) throw new Error("Confirm the exact question text before practice.");
  if (!confirmation.markschemeText.trim()) throw new Error("Connect this question to its markscheme text.");
  if (confirmation.questionPages.length === 0 || confirmation.markschemePages.length === 0) {
    throw new Error("Confirm the source page and markscheme page.");
  }
  if (
    confirmation.questionPages.some((page) => !Number.isInteger(page) || page < 1) ||
    confirmation.markschemePages.some((page) => !Number.isInteger(page) || page < 1)
  ) {
    throw new Error("Page references must be positive whole numbers.");
  }
  if (confirmation.topicIds.length === 0) throw new Error("Choose at least one syllabus topic.");
}

export function createRepositories(db: RevisionDatabase) {
  return {
    async savePaperBundle(bundle: PaperBundle): Promise<void> {
      assertPaperBundle(bundle);
      await withStorageError(() => db.transaction(
        "rw",
        db.papers,
        db.documents,
        async () => {
          await db.papers.put(bundle.paper);
          await db.documents.bulkPut([bundle.questionPaper, bundle.markscheme]);
        },
      ));
    },

    getPaper(paperId: string): Promise<PaperRecord | undefined> {
      return db.papers.get(paperId);
    },

    listPapers(subjectId?: SubjectId): Promise<PaperRecord[]> {
      if (subjectId) return db.papers.where("subjectId").equals(subjectId).toArray();
      return db.papers.toArray();
    },

    getDocument(documentId: string): Promise<StoredDocument | undefined> {
      return db.documents.get(documentId);
    },

    listDocuments(paperId: string): Promise<StoredDocument[]> {
      return db.documents.where("paperId").equals(paperId).toArray();
    },

    async saveQuestion(question: QuestionRecord): Promise<void> {
      if (question.verified || question.status !== "draft") {
        throw new Error("New questions must be saved as unverified drafts.");
      }
      await withStorageError(() => db.questions.put(question));
    },

    async confirmQuestion(questionId: string, confirmation: QuestionConfirmation): Promise<QuestionRecord> {
      assertConfirmation(confirmation);
      return db.transaction("rw", db.questions, db.papers, db.documents, async () => {
        const question = await db.questions.get(questionId);
        if (!question) throw new Error("Question not found.");
        if (question.status !== "draft" || question.verified) {
          throw new Error("Only an unverified question draft can be confirmed.");
        }

        const paper = await db.papers.get(question.paperId);
        if (!paper) throw new Error("Add the paper record before confirming questions.");
        const [questionDocument, markschemeDocument] = await Promise.all([
          db.documents.get(paper.questionDocumentId),
          db.documents.get(paper.markschemeDocumentId),
        ]);
        if (!questionDocument || !markschemeDocument) {
          throw new Error("Add both the question paper and matching markscheme first.");
        }
        if (confirmation.topicIds.some((topicId) => !topicId.startsWith(`${paper.subjectId}:`))) {
          throw new Error("Question topics must belong to the paper's subject.");
        }

        const confirmed: QuestionRecord = {
          ...question,
          ...confirmation,
          topicIds: [...new Set(confirmation.topicIds)],
          verified: true,
          status: "confirmed",
        };
        await db.questions.put(confirmed);
        return confirmed;
      });
    },

    async listPracticeQuestions(subjectId: SubjectId, topicId: string): Promise<QuestionRecord[]> {
      const papers = await db.papers.where("subjectId").equals(subjectId).toArray();
      if (papers.length === 0) return [];
      const paperIds = papers.map(({ id }) => id);
      return db.questions
        .where("paperId")
        .anyOf(paperIds)
        .filter((question) =>
          question.verified && question.status === "confirmed" && question.topicIds.includes(topicId),
        )
        .toArray();
    },

    async saveAttempt(attempt: AttemptRecord): Promise<void> {
      await db.transaction("rw", db.questions, db.attempts, async () => {
        const question = await db.questions.get(attempt.questionId);
        if (!question?.verified || question.status !== "confirmed") {
          throw new Error("Only a confirmed past-paper question can be recorded as an attempt.");
        }
        await db.attempts.put(attempt);
      });
    },

    async saveSelfRating(questionId: string, selfRating: SelfRating, answerMode: AttemptRecord["answerMode"]): Promise<void> {
      await this.saveAttempt({
        id: crypto.randomUUID(),
        questionId,
        attemptedAt: new Date().toISOString(),
        answerMode,
        selfRating,
      });
    },

    listAttempts(questionId?: string): Promise<AttemptRecord[]> {
      if (questionId) return db.attempts.where("questionId").equals(questionId).toArray();
      return db.attempts.toArray();
    },

    async upsertTopic(topic: TopicDefinition): Promise<void> {
      if (!topic.title.trim()) throw new Error("A topic name is required.");
      await db.topics.put({ ...topic, title: topic.title.trim() });
    },

    async listTopics(subjectId: SubjectId, syllabusVersion: string): Promise<TopicDefinition[]> {
      return db.topics
        .where("[subjectId+syllabusVersion]")
        .equals([subjectId, syllabusVersion])
        .sortBy("sortOrder");
    },

    getSettings(): Promise<AppSettingsRecord | undefined> {
      return db.settings.get("app");
    },

    async saveSettings(settings: AppSettingsRecord): Promise<void> {
      await db.settings.put(settings);
    },
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function getBrowserStorageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return {
    usage,
    quota,
    usagePercent: quota > 0 ? Math.min(100, (usage / quota) * 100) : null,
  };
}

export const revisionRepositories = createRepositories;
