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
