import type { ExtractedPage } from "../pdf/extract";

export interface QuestionDraft {
  id: string;
  number: string;
  exactText: string;
  questionPages: number[];
}

interface MutableQuestionDraft extends QuestionDraft {
  lines: string[];
  pages: Set<number>;
}

const questionHeading = /^\s*(?:question\s+)?(\d{1,2})[.)]\s*(.*)$/i;

function finishDraft(draft: MutableQuestionDraft | null): QuestionDraft | null {
  if (!draft) return null;
  const exactText = draft.lines.join("\n").trim();
  if (!exactText) return null;
  return {
    id: draft.id,
    number: draft.number,
    exactText,
    questionPages: [...draft.pages].sort((a, b) => a - b),
  };
}

export function suggestQuestionDrafts(pages: readonly ExtractedPage[]): QuestionDraft[] {
  const drafts: QuestionDraft[] = [];
  let current: MutableQuestionDraft | null = null;
  let index = 0;

  for (const page of pages) {
    for (const line of page.text.split(/\r?\n/)) {
      const match = questionHeading.exec(line);
      if (match) {
        const completed = finishDraft(current);
        if (completed) drafts.push(completed);
        index += 1;
        current = {
          id: `candidate-${index}`,
          number: match[1],
          exactText: "",
          questionPages: [],
          lines: [line.trim()],
          pages: new Set([page.pageNumber]),
        };
        continue;
      }

      if (current && line.trim()) {
        current.lines.push(line.trim());
        current.pages.add(page.pageNumber);
      }
    }
  }

  const finalDraft = finishDraft(current);
  if (finalDraft) drafts.push(finalDraft);
  return drafts;
}

function normalizeForComparison(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function isExactSourceText(candidate: string, pages: readonly ExtractedPage[]): boolean {
  const normalizedCandidate = normalizeForComparison(candidate);
  if (!normalizedCandidate) return false;
  const source = normalizeForComparison(pages.map(({ text }) => text).join(" "));
  return source.includes(normalizedCandidate);
}

export function isExactSourceTextOnPages(
  candidate: string,
  pages: readonly ExtractedPage[],
  pageNumbers: readonly number[],
): boolean {
  const selectedPages = new Set(pageNumbers);
  return isExactSourceText(candidate, pages.filter(({ pageNumber }) => selectedPages.has(pageNumber)));
}
