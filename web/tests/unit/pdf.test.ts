// @vitest-environment node
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractPdfPages } from "../../src/lib/pdf/extract";
import { isExactSourceText, suggestQuestionDrafts } from "../../src/lib/papers/question-drafts";

async function makeTwoPagePaper(): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([612, 792]);
  first.drawText("1. State one function of the cell membrane.", { x: 56, y: 730, size: 12, font });
  first.drawText("(a) Explain how its structure supports this function.", { x: 76, y: 708, size: 12, font });
  const second = pdf.addPage([612, 792]);
  second.drawText("2. Describe the role of enzymes in digestion.", { x: 56, y: 730, size: 12, font });
  const bytes = await pdf.save();
  const copy = Uint8Array.from(bytes).buffer;
  return new File([copy], "biology-paper.pdf", { type: "application/pdf" });
}

describe("local PDF extraction", () => {
  it("extracts text from the original PDF page by page", async () => {
    const pages = await extractPdfPages(await makeTwoPagePaper());

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain("1. State one function of the cell membrane.");
    expect(pages[0].text).toContain("Explain how its structure supports this function.");
    expect(pages[1]).toMatchObject({
      pageNumber: 2,
      text: expect.stringContaining("2. Describe the role of enzymes in digestion."),
    });
  });

  it("rejects non-PDF and empty files before parsing", async () => {
    await expect(extractPdfPages(new File(["not a pdf"], "notes.txt", { type: "text/plain" })))
      .rejects.toThrow(/pdf/i);
    await expect(extractPdfPages(new File([], "empty.pdf", { type: "application/pdf" })))
      .rejects.toThrow(/empty/i);
  });
});

describe("past-paper question candidates", () => {
  const pages = [
    { pageNumber: 1, text: "1. State one function of the cell membrane.\n(a) Explain how its structure supports this function." },
    { pageNumber: 2, text: "The question continues here.\n\n2. Describe the role of enzymes in digestion." },
  ];

  it("splits numbered question candidates while retaining exact wording and page references", () => {
    const drafts = suggestQuestionDrafts(pages);

    expect(drafts.map(({ number }) => number)).toEqual(["1", "2"]);
    expect(drafts[0].exactText).toContain("1. State one function of the cell membrane.");
    expect(drafts[0].exactText).toContain("The question continues here.");
    expect(drafts[0].questionPages).toEqual([1, 2]);
    expect(drafts[1].questionPages).toEqual([2]);
  });

  it("reports whether edited question wording is present in the source PDF text", () => {
    expect(isExactSourceText("State one function of the cell membrane.", pages)).toBe(true);
    expect(isExactSourceText("Invent a question about photosynthesis.", pages)).toBe(false);
  });

  it("returns no automatic candidates when the PDF contains no recognizable question heading", () => {
    expect(suggestQuestionDrafts([{ pageNumber: 1, text: "A scanned page without selectable text." }])).toEqual([]);
  });
});
