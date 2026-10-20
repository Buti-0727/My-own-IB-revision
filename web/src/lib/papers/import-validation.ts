import type { ExtractedPage } from "../pdf/extract";
import { isExactSourceTextOnPages } from "./question-drafts";

export interface QuestionReviewInput {
  questionText: string;
  sourcePages: readonly ExtractedPage[];
  questionPagesInput: string;
  paperPageCount: number;
  markschemeText: string;
  markschemePagesInput: string;
  markschemePageCount: number;
  topicIds: readonly string[];
  manualSourceConfirmed: boolean;
}

export async function validatePdfFile(file: File): Promise<void> {
  if (file.size <= 0) throw new Error("The PDF file is empty.");
  if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("en").endsWith(".pdf")) {
    throw new Error("Choose a PDF file.");
  }

  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const headerText = new TextDecoder("latin1").decode(header);
  if (!headerText.includes("%PDF-")) throw new Error("Choose a valid PDF file.");
}

export function parsePageNumbers(input: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("The PDF has no readable pages.");
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter at least one page number.");

  const selected = new Set<number>();
  for (const part of trimmed.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error("Enter pages as numbers, for example 2 or 2-3.");
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount) {
      throw new Error(`Choose pages from 1 to ${pageCount}.`);
    }
    for (let page = start; page <= end; page += 1) selected.add(page);
  }
  return [...selected].sort((a, b) => a - b);
}

export function getQuestionReviewIssues(input: QuestionReviewInput): string[] {
  const issues: string[] = [];
  if (!input.questionText.trim()) issues.push("Enter the question wording.");

  let selectedQuestionPages: number[] = [];
  let questionPageSelectionValid = false;
  try {
    selectedQuestionPages = parsePageNumbers(input.questionPagesInput, input.paperPageCount);
    questionPageSelectionValid = true;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Check the question page reference.");
  }

  if (
    input.questionText.trim() &&
    questionPageSelectionValid &&
    !isExactSourceTextOnPages(input.questionText, input.sourcePages, selectedQuestionPages) &&
    !input.manualSourceConfirmed
  ) {
    issues.push("Check the wording against the PDF or confirm your manual transcription.");
  }

  if (!input.markschemeText.trim()) issues.push("Choose the matching markscheme text and page.");
  try {
    parsePageNumbers(input.markschemePagesInput, input.markschemePageCount);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Check the markscheme page reference.");
  }
  if (input.topicIds.length === 0) issues.push("Choose at least one topic.");
  return issues;
}
