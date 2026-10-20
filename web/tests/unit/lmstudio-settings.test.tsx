import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LMStudioSettings } from "../../src/components/settings/lmstudio-settings";
import { createRepositories } from "../../src/lib/storage/repositories";
import { revisionDb } from "../../src/lib/storage/db";

const feedback = {
  creditedPoints: ["The response recognizes the key idea."],
  missingPoints: [],
  explanation: "The local model returned structured feedback.",
  uncertainty: [],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LM Studio settings", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("saves the chosen model and tests text and image feedback through the local API", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ models: [{ id: "qwen3-8b" }, { id: "llama-3.2-vision" }] }))
      .mockResolvedValueOnce(jsonResponse(feedback))
      .mockResolvedValueOnce(jsonResponse(feedback));
    render(<LMStudioSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Find local models" }));
    await screen.findByRole("option", { name: "qwen3-8b" });
    fireEvent.change(screen.getByLabelText("Local model"), { target: { value: "llama-3.2-vision" } });
    await waitFor(async () => {
      expect((await createRepositories(revisionDb).getSettings())?.selectedModelId).toBe("llama-3.2-vision");
    });

    fireEvent.click(screen.getByRole("button", { name: "Test text feedback" }));
    expect(await screen.findByText(/The local model returned structured feedback/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/lmstudio/feedback", expect.objectContaining({ method: "POST" }));

    const image = new File([new Uint8Array([1, 2, 3])], "sample.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Optional sample answer image"), { target: { files: [image] } });
    fireEvent.click(screen.getByRole("button", { name: "Test image feedback" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const imageBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(imageBody.answer.images[0]).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText(/Image check passed/)).toBeInTheDocument();
  });
});
