import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NestProblemDialog } from "./NestProblemDialog";

describe("nest problem dialog", () => {
  const problems = [
    { kind: "unplaced" as const, tag: "9", name: "Pantry side", text: "larger than every sheet" },
    { kind: "material" as const, tag: "1", name: "Door", text: 'Door plywood is set to 1/2" 4x4, but it went on 4 x 8 sheet, 3/4' },
  ];
  it("names every part and saves only when asked", () => {
    const onSave = vi.fn();
    const onStock = vi.fn();
    const onClose = vi.fn();
    render(<NestProblemDialog req={{ what: "the CNC files", problems, onSave, onStock }} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "The nesting has problems" }).textContent).toContain("2 parts will not be cut as drawn");
    expect(screen.getByText(/Pantry side/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save the CNC files anyway" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Stock..." }));
    expect(onStock).toHaveBeenCalledTimes(1);
  });
});

describe("nest problem dialog with a fix", () => {
  it("offers the fix first, and no Open Stock... for spacing alone", () => {
    const run = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <NestProblemDialog
        req={{ what: "the CNC files", problems: [{ kind: "spacing", tag: "", name: "Every sheet", text: "parts are 1/8 in apart" }], onSave, onStock: () => {}, fix: { label: "Use CNC spacing", run } }}
        onClose={() => {}}
      />,
    );
    const mine = within(container);
    expect(mine.queryByRole("button", { name: "Open Stock..." })).toBeNull();
    fireEvent.click(mine.getByRole("button", { name: "Use CNC spacing" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

