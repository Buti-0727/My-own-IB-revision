import { describe, expect, it } from "vitest";
import type { PaperRecord, QuestionRecord } from "../../src/lib/domain/types";
import { buildFeedbackRequest, selectQuestions } from "../../src/lib/practice/select-questions";

const biologyPaper: PaperRecord = {
  id: "bio-paper",
  subjectId: "biology-sl",
  examSession: "May 2026",
  component: "Paper 1",
  syllabusVersion: "first-assessment-2025",
  questionDocumentId: "bio-question-pdf",
  markschemeDocumentId: "bio-markscheme-pdf",
  createdAt: "2026-10-20T00:00:00.000Z",
};

const chemistryPaper: PaperRecord = {
  ...biologyPaper,
  id: "chem-paper",
  subjectId: "chemistry-hl",
  component: "Paper 2",
};

const confirmedBiologyQuestion: QuestionRecord = {
  id: "bio-q1",
  paperId: biologyPaper.id,
  number: "1(a)",
  exactText: "State one function of the cell membrane.",
  questionPages: [2],
  markschemeText: "Accept: controls movement into and out of the cell.",
  markschemePages: [5],
  topicIds: ["biology:cell-structure"],
  verified: true,
  status: "confirmed",
};

const draftBiologyQuestion: QuestionRecord = {
  ...confirmedBiologyQuestion,
  id: "bio-draft",
  number: "2",
  verified: false,
  status: "draft",
};

const confirmedChemistryQuestion: QuestionRecord = {
  ...confirmedBiologyQuestion,
  id: "chem-q1",
  paperId: chemistryPaper.id,
  topicIds: ["chemistry:bonding"],
};

const topicMismatchQuestion: QuestionRecord = {
  ...confirmedBiologyQuestion,
  id: "bio-q-other-topic",
  topicIds: ["biology:enzymes"],
};

describe("paper-only topic practice", () => {
  it("selects only confirmed questions from the chosen subject and topic", () => {
    const questions = [
      { ...confirmedBiologyQuestion, paper: biologyPaper },
      { ...draftBiologyQuestion, paper: biologyPaper },
      { ...confirmedChemistryQuestion, paper: chemistryPaper },
      { ...topicMismatchQuestion, paper: biologyPaper },
    ];

    expect(selectQuestions(questions, "biology-sl", "biology:cell-structure", 4))
      .toEqual([{ ...confirmedBiologyQuestion, paper: biologyPaper }]);
    expect(selectQuestions(questions, "biology-sl", "biology:enzymes", 4))
      .toEqual([{ ...topicMismatchQuestion, paper: biologyPaper }]);
    expect(selectQuestions(questions, "biology-sl", "biology:missing", 4)).toEqual([]);
  });

  it("does not exceed the requested question count", () => {
    const questions = [1, 2, 3].map((number) => ({
      ...confirmedBiologyQuestion,
      id: `bio-q${number}`,
      number: String(number),
      paper: biologyPaper,
    }));

    expect(selectQuestions(questions, "biology-sl", "biology:cell-structure", 2)).toHaveLength(2);
    expect(selectQuestions(questions, "biology-sl", "biology:cell-structure", 0)).toEqual([]);
  });

  it("builds feedback from the exact paper wording and its matching markscheme", () => {
    expect(buildFeedbackRequest(confirmedBiologyQuestion, { text: "It controls movement." })).toEqual({
      questionText: confirmedBiologyQuestion.exactText,
      answer: { text: "It controls movement." },
      markschemeText: confirmedBiologyQuestion.markschemeText,
    });
  });

  it("refuses feedback for unconfirmed questions or an empty answer", () => {
    expect(() => buildFeedbackRequest(draftBiologyQuestion, { text: "An answer." })).toThrow(/confirmed/i);
    expect(() => buildFeedbackRequest(confirmedBiologyQuestion, { text: "   " })).toThrow(/answer/i);
  });
});
