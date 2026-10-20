import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { ExtractedPage } from "../../src/lib/pdf/extract";
import { getQuestionReviewIssues, parsePageNumbers, validatePdfFile } from "../../src/lib/papers/import-validation";

async function makePdfFile(): Promise<File> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  page.drawText("Paper source", { x: 40, y: 740, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const bytes = await pdf.save();
  return new File([Uint8Array.from(bytes).buffer], "paper.pdf", { type: "application/pdf" });
}

describe("paper PDF import validation", () => {
  it("accepts an actual PDF and rejects a renamed non-PDF file", async () => {
    await expect(validatePdfFile(await makePdfFile())).resolves.toBeUndefined();
    await expect(validatePdfFile(new File(["not a PDF"], "paper.pdf", { type: "application/pdf" })))
      .rejects.toThrow(/valid pdf/i);
  });

  it("parses page numbers and ranges while rejecting pages outside the document", () => {
    expect(parsePageNumbers("1, 3-4, 4", 5)).toEqual([1, 3, 4]);
    expect(() => parsePageNumbers("0, 2", 5)).toThrow(/page/i);
    expect(() => parsePageNumbers("2-6", 5)).toThrow(/page/i);
    expect(() => parsePageNumbers("one", 5)).toThrow(/page/i);
  });

  it("blocks question confirmation unless source, markscheme, pages, and topic are checked", () => {
    const sourcePages: ExtractedPage[] = [
      { pageNumber: 1, text: "1. State the role of the cell membrane." },
      { pageNumber: 2, text: "Accept: controls movement into and out of the cell." },
    ];
    const base = {
      questionText: "State the role of the cell membrane.",
      sourcePages,
      questionPagesInput: "1",
      paperPageCount: 2,
      markschemeText: "Accept: controls movement into and out of the cell.",
      markschemePagesInput: "2",
      markschemePageCount: 2,
      topicIds: ["biology-sl:first-assessment-2025:cell-structure"],
      manualSourceConfirmed: false,
    };

    expect(getQuestionReviewIssues(base)).toEqual([]);
    expect(getQuestionReviewIssues({ ...base, questionPagesInput: "2" })).toContain(
      "Check the wording against the PDF or confirm your manual transcription.",
    );
    expect(getQuestionReviewIssues({ ...base, questionText: "Write a new question.", manualSourceConfirmed: false }))
      .toContain("Check the wording against the PDF or confirm your manual transcription.");
    expect(getQuestionReviewIssues({ ...base, markschemeText: "", topicIds: [] }))
      .toEqual(expect.arrayContaining(["Choose the matching markscheme text and page.", "Choose at least one topic."]));
  });

  it("allows a scanned-page transcription only after the user attests they checked the PDF", () => {
    const issues = getQuestionReviewIssues({
      questionText: "1. Draw and label the structure.",
      sourcePages: [{ pageNumber: 1, text: "" }],
      questionPagesInput: "1",
      paperPageCount: 1,
      markschemeText: "Award marks for the correctly labelled structure.",
      markschemePagesInput: "1",
      markschemePageCount: 1,
      topicIds: ["biology-sl:first-assessment-2025:cell-structure"],
      manualSourceConfirmed: true,
    });

    expect(issues).toEqual([]);
  });
});
