import { describe, expect, it } from "vitest";
import { checkLinearProgram, type Contract } from "./linear-contract";

// Invented dimensions and speeds: these are test data, not Shapeoko settings.
const setup: Contract = {
  min: { x: 0, y: 0, z: -10 }, max: { x: 100, y: 100, z: 20 },
  initial: { x: 0, y: 0, z: 10 }, clearance: 5,
  maxFeed: 1000, maxPlunge: 200, minRpm: 1000, maxRpm: 20000,
};
const header = "G21\nG90\nG94\nG54\n";
const body = "M3 S12000\nG0 X10 Y10\nG1 Z-2 F100\nG1 X20 F500\nG1 Z5 F100\nM5\nM2";

describe("experimental linear G-code contract", () => {
  it("accepts a complete synthetic linear program", () => {
    expect(checkLinearProgram(header + body, setup)).toEqual([]);
  });
  it.each([
    ["missing units", "G90\nG94\nG54\n" + body],
    ["incremental mode", header + body.replace("G0 X10 Y10", "G91\nG0 X10 Y10")],
    ["machine coordinate move", header + body.replace("G0 X10 Y10", "G53 G0 X10 Y10")],
    ["unknown arc", header + body.replace("G1 X20 F500", "G2 X20 I5 F500")],
    ["modal motion", header + body.replace("G1 X20 F500", "X20 F500")],
    ["duplicate axis", header + body.replace("G0 X10 Y10", "G0 X10 X20")],
    ["out of envelope", header + body.replace("G1 X20 F500", "G1 X101 F500")],
    ["low rapid", header + body.replace("G1 X20 F500", "G0 X20")],
    ["diagonal rapid into stock", header + body.replace("G0 X10 Y10", "G0 X10 Z-2")],
    ["feed without spindle", header + body.replace("M3 S12000\n", "")],
    ["fast plunge", header + body.replace("G1 Z-2 F100", "G1 Z-2 F201")],
    ["fast cut", header + body.replace("G1 X20 F500", "G1 X20 F1001")],
    ["rpm outside range", header + body.replace("S12000", "S21000")],
    ["end below clearance", header + body.replace("G1 Z5 F100\n", "")],
    ["end with spindle on", header + body.replace("M5\n", "")],
    ["missing end", header + body.replace("M2", "")],
    ["commands after end", header + body + "\nG0 X1"],
  ])("rejects %s", (_name, program) => {
    expect(checkLinearProgram(program, setup).length).toBeGreaterThan(0);
  });
  it("rejects an unknown initial position and invalid limits", () => {
    expect(checkLinearProgram(header + body, { ...setup, initial: { ...setup.initial, z: NaN } })).toEqual(["invalid or incomplete contract"]);
    expect(checkLinearProgram(header + body, { ...setup, maxFeed: 0 })).toEqual(["invalid or incomplete contract"]);
  });
  it.each([
    ["tool change", "M6 T201"], ["machine coordinates", "G53 G0 Z-3"],
    ["work offset update", "G10 L20 P1 X0"], ["offset reset", "G92 X0"],
    ["probe", "G38.2 Z-5 F10"], ["end command with undocumented movement", "M30"],
    ["embedded expression", "G1 X[1+2] F10"], ["duplicate feed", "G1 X2 F10 F20"],
    ["non-finite coordinate", "G1 X1e999 F10"], ["negative feed", "G1 X2 F-1"],
    ["bare coordinate", "X10"], ["units change", "G20"], ["relative mode", "G91"],
  ])("refuses to interpret %s", (_name, command) => {
    expect(checkLinearProgram(header + body.replace("G1 X20 F500", command), setup)).not.toEqual([]);
  });
  it("detects out-of-envelope positions around every configured face", () => {
    for (const move of ["X-0.001", "X100.001", "Y-0.001", "Y100.001", "Z-10.001", "Z20.001"]) {
      expect(checkLinearProgram(header + body.replace("G1 X20 F500", `G1 ${move} F100`), setup)).toContainEqual(expect.stringContaining("outside configured work envelope"));
    }
  });
  it("detects a horizontal rapid at low Z even when the destination is raised", () => {
    const program = header + body.replace("G1 X20 F500", "G0 X20 Z5");
    expect(checkLinearProgram(program, setup)).toContainEqual(expect.stringContaining("rapid below clearance"));
  });
  it("does not let a missing or invalid starting height pass", () => {
    for (const z of [NaN, Infinity, 4.999, -100, 21]) {
      expect(checkLinearProgram(header + body, { ...setup, initial: { ...setup.initial, z } })).toEqual(["invalid or incomplete contract"]);
    }
  });
});
