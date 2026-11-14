import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PanelField } from "../plugins/panel";
import { PluginPanel } from "./PluginPanel";

const IN = 0.0254;

describe("plugin panel length fields", () => {
  it("show a length the display would round in full, and leaving it untouched commits nothing", () => {
    const onChange = vi.fn();
    const fields: PanelField[] = [
      { type: "number", id: "stock", label: "Stock", unit: "length", value: (23 / 32) * IN },
      { type: "number", id: "fit", label: "Fit", unit: "length", value: 0.008 * IN },
    ];
    render(<PluginPanel panelKey="p" fields={fields} units="frac-in" onChange={onChange} onAction={() => {}} />);
    const stock = screen.getByLabelText("Stock") as HTMLInputElement;
    const fit = screen.getByLabelText("Fit") as HTMLInputElement;
    expect(stock.value).toBe("23/32");
    expect(fit.value).toBe("0.008");
    // Click in and out, or press Enter, without typing: no change is sent (it was 3/4 and 0).
    for (const input of [stock, fit]) {
      fireEvent.focus(input);
      fireEvent.blur(input);
      fireEvent.keyDown(input, { key: "Enter" });
    }
    expect(onChange).not.toHaveBeenCalled();
    // Typing a new length still commits it.
    fireEvent.change(stock, { target: { value: "3/4" } });
    fireEvent.keyDown(stock, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe("stock");
    expect(onChange.mock.calls[0][1]).toBeCloseTo(0.75 * IN, 12);
  });
});

describe("plugin panel sections", () => {
  it("show the label, the summary while closed, and report the opposite of their state when clicked", () => {
    const onChange = vi.fn();
    const closed: PanelField[] = [{ type: "section", id: "size", label: "1 · Size", summary: "24 × 34 1/2", value: false }];
    const { rerender } = render(<PluginPanel panelKey="p" fields={closed} units="frac-in" onChange={onChange} onAction={() => {}} />);
    const head = screen.getByRole("button", { name: /1 · Size/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(head.textContent).toContain("24 × 34 1/2");
    fireEvent.click(head);
    expect(onChange).toHaveBeenCalledWith("size", true);
    rerender(<PluginPanel panelKey="p" fields={[{ ...closed[0], value: true } as PanelField]} units="frac-in" onChange={onChange} onAction={() => {}} />);
    expect(screen.getByRole("button", { name: /1 · Size/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /1 · Size/ }));
    expect(onChange).toHaveBeenLastCalledWith("size", false);
  });
});

