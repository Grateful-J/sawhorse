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

describe("nest problem dialog for cuts that would be wrong", () => {
  it("names them, offers Stock only for a thickness, and saves only when asked", () => {
    const onSave = vi.fn();
    const cuts = [{ kind: "cuts" as const, tag: "2", name: "Left side", text: "some of its cuts could not be placed on the part and would be left out of the file" }];
    const first = render(<NestProblemDialog req={{ what: "the CNC files", problems: cuts, onSave, onStock: () => {} }} onClose={() => {}} />);
    const mine = within(first.container);
    expect(first.container.textContent).toContain("Some parts will not be cut as drawn");
    expect(first.container.textContent).toContain("Left side");
    expect(mine.queryByRole("button", { name: "Open Stock..." })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(mine.getByRole("button", { name: "Save the CNC files anyway" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    first.unmount();
    const thick = [{ kind: "thickness" as const, tag: "", name: "Door", text: "drawn 3/4 in thick but nested on 4 x 4 sheet, 3/4 (23/32 in)" }];
    const second = render(<NestProblemDialog req={{ what: "the CNC files", problems: thick, onSave, onStock: () => {} }} onClose={() => {}} />);
    expect(within(second.container).getByRole("button", { name: "Open Stock..." })).toBeTruthy();
  });

  it("counts parts only when every problem is one part: a sheet of another size, or a thickness beside a part on no stock, is 'Some parts'", () => {
    const sheet = [{ kind: "footprint" as const, tag: "1a, 1b, 2", name: "4 x 8 sheet, 3/4", text: "a sheet 48 x 96 in, not the 48 x 48 in the router is set to" }];
    const first = render(<NestProblemDialog req={{ what: "the CNC files", problems: sheet, onSave: () => {}, onStock: () => {} }} onClose={() => {}} />);
    // One line, three parts on it: never "1 part".
    expect(first.container.querySelector("header")?.textContent).toBe("Some parts will not be cut as drawn");
    expect(within(first.container).getByRole("button", { name: "Open Stock..." })).toBeTruthy();
    first.unmount();
    const mixed = [
      { kind: "unplaced" as const, tag: "3", name: "Top", text: "too large" },
      { kind: "thickness" as const, tag: "", name: "Door, Left side", text: "drawn 3/4 in thick" },
    ];
    const second = render(<NestProblemDialog req={{ what: "the DXF", problems: mixed, onSave: () => {}, onStock: () => {} }} onClose={() => {}} />);
    expect(second.container.querySelector("header")?.textContent).toBe("Some parts will not be cut as drawn");
    second.unmount();
    const parts = [
      { kind: "unplaced" as const, tag: "3", name: "Top", text: "too large" },
      { kind: "material" as const, tag: "4", name: "Back", text: "went on another sheet" },
    ];
    const third = render(<NestProblemDialog req={{ what: "the DXF", problems: parts, onSave: () => {}, onStock: () => {} }} onClose={() => {}} />);
    expect(third.container.querySelector("header")?.textContent).toBe("2 parts will not be cut as drawn");
  });
});
