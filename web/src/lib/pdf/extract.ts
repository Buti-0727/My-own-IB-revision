export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

function textItemText(item: unknown): { str: string; hasEOL: boolean } | null {
  if (typeof item !== "object" || item === null || !("str" in item)) return null;
  const candidate = item as { str?: unknown; hasEOL?: unknown };
  if (typeof candidate.str !== "string") return null;
  return { str: candidate.str, hasEOL: candidate.hasEOL === true };
}

function normalizePageText(value: string) {
  return value
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfPages(file: File): Promise<ExtractedPage[]> {
  if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("en").endsWith(".pdf")) {
    throw new Error("Choose a PDF file.");
  }
  if (file.size === 0) throw new Error("The PDF file is empty.");

  const pdfjs =
    typeof window === "undefined"
      ? await import("pdfjs-dist/legacy/build/pdf.mjs")
      : await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const document = await loadingTask.promise;
    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      let text = "";

      for (const item of textContent.items) {
        const part = textItemText(item);
        if (!part) continue;
        text += part.str;
        text += part.hasEOL ? "\n" : " ";
      }

      pages.push({ pageNumber, text: normalizePageText(text) });
      page.cleanup();
    }

    await loadingTask.destroy();
    return pages;
  } catch (error) {
    await loadingTask.destroy();
    throw new Error("This PDF could not be read. Check that it opens normally, then try again.", { cause: error });
  }
}
