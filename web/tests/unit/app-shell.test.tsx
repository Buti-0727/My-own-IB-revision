import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../src/components/app-shell";

describe("AppShell", () => {
  it("shows all six subjects and the primary study navigation", () => {
    render(<AppShell />);

    expect(screen.getByRole("link", { name: "Revision Studio home" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Study sections" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Your subjects" })).toBeInTheDocument();

    for (const subject of [
      "English B SL",
      "Chinese A Language & Literature SL",
      "Chemistry HL",
      "Mathematics AA HL",
      "Biology SL",
      "Psychology HL",
    ]) {
      expect(screen.getByRole("button", { name: subject })).toBeInTheDocument();
    }
  });

  it("changes the selected subject and section without a page reload", () => {
    render(<AppShell />);

    const subjects = within(screen.getByRole("navigation", { name: "Your subjects" }));
    fireEvent.click(subjects.getByRole("button", { name: "Biology SL" }));
    expect(screen.getByRole("heading", { name: "Biology SL" })).toBeInTheDocument();
    expect(subjects.getByRole("button", { name: "Biology SL" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Papers" }));
    expect(screen.getByRole("heading", { name: "Papers" })).toBeInTheDocument();
    expect(screen.getByText(/Your past papers and markschemes will live here/)).toBeInTheDocument();
  });
});
