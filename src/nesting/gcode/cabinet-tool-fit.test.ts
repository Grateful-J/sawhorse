import { describe, expect, it } from "vitest";
import { applyPreset, defaults, plan } from "../../../plugins/cabinet-generator/cabinet.js";

const inch = 0.0254;

describe("cabinet's tool-fit warnings for the Shapeoko CAM workflow", () => {
  const base = applyPreset(defaults(false), "base", false);
  it("warns that the default narrow back groove needs a smaller cutter than 1/4 inch", () => {
    const result = plan({ ...base, bit: inch / 4 }, false);
    expect(result.error).toBeNull();
    expect(result.rows.some(row => row[0] === "Grooves" && row[4] === "Change bit" && /narrower than/.test(row[1]))).toBe(true);
  });
  it("does not call a 1/8 inch bit too wide for that same groove", () => {
    const result = plan({ ...base, bit: inch / 8 }, false);
    expect(result.error).toBeNull();
    expect(result.rows.some(row => row[0] === "Grooves" && row[4] === "Change bit")).toBe(false);
  });
});
