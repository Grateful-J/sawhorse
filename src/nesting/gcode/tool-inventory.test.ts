import { describe, expect, it } from "vitest";
import { findPocketCutters, type ShopCutter } from "./tool-inventory";
const mm = 0.001;
const need = { width: 4.7625 * mm, depth: 19.05 * mm };
const bit: ShopCutter = { name: "Example 1/8 in cutter", diameter: 3.175 * mm, cuttingLength: 20 * mm, shank: 3.175 * mm, confirmedOwned: true };

describe("explicit shop inventory preflight", () => {
  it("finds a confirmed cutter with sufficient reach and a matching collet", () => {
    expect(findPocketCutters(need, [bit], [3.175 * mm]).candidates).toEqual([bit]);
  });
  it("does not count catalog or starter tools as owned", () => {
    expect(findPocketCutters(need, [{ ...bit, confirmedOwned: false }], [3.175 * mm]).found).toBe(false);
  });
  it.each([null, 0, NaN, Infinity])("requires a valid width: %s", width => {
    expect(findPocketCutters({ ...need, width }, [bit], [3.175 * mm]).found).toBe(false);
  });
  it.each([null, 0, NaN, Infinity])("requires a valid depth: %s", depth => {
    expect(findPocketCutters({ ...need, depth }, [bit], [3.175 * mm]).found).toBe(false);
  });
  it("rejects cutters equal to or wider than the hole", () => {
    for (const diameter of [4.7625 * mm, 6.35 * mm]) expect(findPocketCutters(need, [{ ...bit, diameter }], [3.175 * mm]).found).toBe(false);
  });
  it("rejects cutters too short to reach through the material", () => {
    expect(findPocketCutters(need, [{ ...bit, cuttingLength: 12.7 * mm }], [3.175 * mm]).found).toBe(false);
  });
  it("does not count a bit with unknown dimensions or unknown collets", () => {
    expect(findPocketCutters(need, [{ ...bit, cuttingLength: null }], [3.175 * mm]).incomplete).not.toEqual([]);
    expect(findPocketCutters(need, [bit], null).found).toBe(false);
    expect(findPocketCutters(need, [bit], []).found).toBe(false);
  });
  it("rejects an incompatible shank", () => {
    expect(findPocketCutters(need, [bit], [6.35 * mm]).found).toBe(false);
  });
  it("filters a mixture without mistaking unsuitable or unconfirmed tools for available ones", () => {
    const wide = { ...bit, name: "wide", diameter: 6.35 * mm };
    const short = { ...bit, name: "short", cuttingLength: 10 * mm };
    const unconfirmed = { ...bit, name: "unconfirmed", confirmedOwned: false };
    expect(findPocketCutters(need, [wide, short, unconfirmed, bit], [3.175 * mm]).candidates).toEqual([bit]);
  });
});
