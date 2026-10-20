import type { FeedbackRequest } from "../ai/contracts";
import type { PaperRecord, QuestionRecord, SubjectId } from "../domain/types";

export interface PracticeQuestion extends QuestionRecord {
  paper: PaperRecord;
}

export type AnswerDraft = FeedbackRequest["answer"];
export type FeedbackRequestContent = Pick<FeedbackRequest, "questionText" | "answer" | "markschemeText">;

export function selectQuestions(
  questions: readonly PracticeQuestion[],
  subjectId: SubjectId,
  topicId: string,
  count: number,
): PracticeQuestion[] {
  if (!topicId || !Number.isInteger(count) || count < 1) return [];

  const selected = new Map<string, PracticeQuestion>();
  for (const item of questions) {
    if (
      item.paper.subjectId === subjectId &&
      item.verified &&
      item.status === "confirmed" &&
      item.topicIds.includes(topicId) &&
      !selected.has(item.id)
    ) {
      selected.set(item.id, item);
    }
  }
  return [...selected.values()].slice(0, count);
}

export function buildFeedbackRequest(
  question: QuestionRecord,
  answer: AnswerDraft,
): FeedbackRequestContent {
  if (!question.verified || question.status !== "confirmed") {
    throw new Error("AI feedback is available only for a confirmed past-paper question.");
  }
  if (!question.exactText.trim() || !question.markschemeText.trim()) {
    throw new Error("This question is missing its confirmed paper wording or markscheme text.");
  }

  const text = answer.text?.trim() ?? "";
  const images = answer.images?.filter(Boolean) ?? [];
  if (!text && images.length === 0) throw new Error("Enter an answer or add an answer photo first.");

  return {
    questionText: question.exactText,
    answer: {
      ...(text ? { text } : {}),
      ...(images.length ? { images } : {}),
    },
    markschemeText: question.markschemeText,
  };
}
