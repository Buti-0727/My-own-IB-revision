import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AnswerComposer, type AnswerComposerValue } from "../../src/components/practice/answer-composer";

function ControlledAnswerComposer() {
  const [value, setValue] = useState<AnswerComposerValue>({
    text: "Original answer.",
    images: ["data:image/png;base64,b2xk"],
    imageNames: ["old.png"],
  });
  return <AnswerComposer value={value} onChange={(nextValue) => setValue(nextValue)} />;
}

describe("answer composer", () => {
  it("keeps edits and photo removals made while a new photo is loading", async () => {
    render(<ControlledAnswerComposer />);
    const photo = new File(["new image bytes"], "new.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("Add answer photos (optional)"), {
      target: { files: [photo] },
    });
    fireEvent.change(screen.getByLabelText("Type your answer"), {
      target: { value: "Updated while the image loads." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove old.png" }));

    expect(await screen.findByRole("button", { name: "Remove new.png" })).toBeInTheDocument();
    expect(screen.getByLabelText("Type your answer")).toHaveValue("Updated while the image loads.");
    expect(screen.queryByRole("button", { name: "Remove old.png" })).not.toBeInTheDocument();
  });
});
