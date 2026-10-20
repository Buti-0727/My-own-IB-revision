import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../../src/components/app-shell";
import { createRepositories } from "../../src/lib/storage/repositories";
import { revisionDb } from "../../src/lib/storage/db";
import type { AppSettingsRecord } from "../../src/lib/domain/types";

const topicId = "biology-sl:first-assessment-2025:unity-and-diversity";
const questionText = "State one function of the cell membrane.";
const markschemeText = "Accept: controls movement into and out of the cell.";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function seedConfirmedQuestion() {
  const repositories = createRepositories(revisionDb);
  const paper = {
    id: "practice-paper",
    subjectId: "biology-sl" as const,
    examSession: "May 2026",
    component: "Paper 1",
    syllabusVersion: "first-assessment-2025",
    questionDocumentId: "practice-question-pdf",
    markschemeDocumentId: "practice-markscheme-pdf",
    createdAt: "2026-10-20T00:00:00.000Z",
  };
  const document = (id: string, kind: "question-paper" | "markscheme") => ({
    id,
    paperId: paper.id,
    kind,
    fileName: `${id}.pdf`,
    mimeType: "application/pdf" as const,
    blob: new Blob([id], { type: "application/pdf" }),
    size: id.length,
  });
  const question = {
    id: "practice-question",
    paperId: paper.id,
    number: "1(a)",
    exactText: questionText,
    questionPages: [2],
    markschemeText,
    markschemePages: [5],
    topicIds: [topicId],
    verified: false,
    status: "draft" as const,
  };

  await repositories.savePaperBundle({
    paper,
    questionPaper: document(paper.questionDocumentId, "question-paper"),
    markscheme: document(paper.markschemeDocumentId, "markscheme"),
  });
  await repositories.saveQuestion(question);
  await repositories.confirmQuestion(question.id, {
    exactText: question.exactText,
    questionPages: question.questionPages,
    markschemeText: question.markschemeText,
    markschemePages: question.markschemePages,
    topicIds: question.topicIds,
  });
  await repositories.saveSettings({
    id: "app",
    examSession: "May 2026",
    syllabusVersions: { "biology-sl": "first-assessment-2025" },
    selectedModelId: "local-test-model",
  });
}

beforeEach(async () => {
  await revisionDb.delete();
  await revisionDb.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  revisionDb.close();
  await revisionDb.delete();
});

describe("paper-only practice workflow", () => {
  it("sends the confirmed source and markscheme to local feedback and saves only a self-rating", async () => {
    await seedConfirmedQuestion();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      creditedPoints: ["Identifies controlled movement."],
      missingPoints: ["Does not mention selective permeability."],
      explanation: "Compare your wording with the official markscheme.",
      uncertainty: [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: "Biology SL" }));
    expect(await screen.findByRole("heading", { name: "Biology SL" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Start practice" }));
    expect(await screen.findByText(questionText)).toBeInTheDocument();
    expect(await screen.findByText("Confirmed topic: Unity and diversity")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type your answer"), {
      target: { value: "It controls movement into and out of the cell." },
    });
    await screen.findByRole("button", { name: "Get local AI feedback" });
    fireEvent.click(screen.getByRole("button", { name: "Get local AI feedback" }));
    expect(await screen.findByText(/Compare your wording with the official markscheme/)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith("/api/lmstudio/feedback", expect.objectContaining({ method: "POST" }));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody).toMatchObject({
      modelId: "local-test-model",
      questionText,
      answer: { text: "It controls movement into and out of the cell." },
      markschemeText,
    });

    fireEvent.click(screen.getByRole("button", { name: "Reveal markscheme" }));
    expect(screen.getByText(markschemeText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Good I could explain this confidently." }));
    expect(await screen.findByRole("heading", { name: "Good work" })).toBeInTheDocument();

    const attempts = await revisionDb.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ questionId: "practice-question", answerMode: "typed", selfRating: "good" });
    expect(attempts[0]).not.toHaveProperty("answerText");
    expect(attempts[0]).not.toHaveProperty("images");
  });

  it("waits for saved local-model settings before enabling feedback", async () => {
    await seedConfirmedQuestion();
    let resolveSettings!: (settings: AppSettingsRecord | undefined) => void;
    const pendingSettings = new Dexie.Promise<AppSettingsRecord | undefined>((resolve) => {
      resolveSettings = resolve;
    });
    vi.spyOn(revisionDb.settings, "get").mockReturnValue(pendingSettings);
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: "Biology SL" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start practice" }));
    fireEvent.change(screen.getByLabelText("Type your answer"), { target: { value: "Cell membrane answer." } });

    expect(await screen.findByRole("button", { name: "Preparing local AI…" })).toBeDisabled();
    resolveSettings({
      id: "app",
      examSession: "May 2026",
      syllabusVersions: { "biology-sl": "first-assessment-2025" },
      selectedModelId: "local-test-model",
    });
    expect(await screen.findByRole("button", { name: "Get local AI feedback" })).toBeEnabled();
  });

  it("keeps the answer available for manual markscheme review when local AI is unavailable", async () => {
    await seedConfirmedQuestion();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "LM_STUDIO_UNAVAILABLE", message: "LM Studio is not responding." },
    }, 503));
    vi.stubGlobal("fetch", fetchMock);
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: "Biology SL" }));
    await screen.findByRole("heading", { name: "Biology SL" });
    fireEvent.click(await screen.findByRole("button", { name: "Start practice" }));
    fireEvent.change(screen.getByLabelText("Type your answer"), { target: { value: "My saved-in-memory answer." } });
    await screen.findByRole("button", { name: "Get local AI feedback" });
    fireEvent.click(screen.getByRole("button", { name: "Get local AI feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("LM Studio is not responding.");
    expect(screen.getByLabelText("Type your answer")).toHaveValue("My saved-in-memory answer.");

    fireEvent.click(screen.getByRole("button", { name: "Reveal markscheme" }));
    expect(screen.getByText(markschemeText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Again I need to practise this more." }));
    await waitFor(async () => expect(await revisionDb.attempts.count()).toBe(1));
    expect((await revisionDb.attempts.toArray())[0]).toMatchObject({ answerMode: "typed", selfRating: "again" });
  });
});
