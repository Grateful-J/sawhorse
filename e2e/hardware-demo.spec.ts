import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openShz } from "./shz";
import type { CutList, Nesting } from "../src/kernel/types";

test("the hardware demo opens as 17 solid parts on three small scraps with the requested thicknesses", async ({ page }, info) => {
  await openShz(page, readFileSync("examples/cnc-hardware-demo/18-inch-slides-and-3-4-inch-door.shz"), 17, "Hardware fit demo.shz");
  const { cut, nest } = await page.evaluate(async () => {
    const app = (window as unknown as { __sawhorse: { cutList(): Promise<CutList>; nest(): Promise<Nesting> } }).__sawhorse;
    return { cut: await app.cutList(), nest: await app.nest() };
  });
  expect(cut.rows.reduce((sum, r) => sum + r.qty, 0)).toBe(17);
  expect(cut.rows.every((r) => !r.not_solid && !r.uncounted)).toBe(true);
  expect(cut.rows.find((r) => r.name === "Drawer front")?.size[0]).toBeCloseTo(.5 * .0254, 9);
  expect(cut.rows.find((r) => r.name === "Door")?.size[0]).toBeCloseTo(.75 * .0254, 9);
  expect(cut.rows.find((r) => r.name === "Drawer bottom")?.size[0]).toBeCloseTo(.25 * .0254, 9);
  expect(nest.unplaced).toEqual([]);
  expect(nest.pieces).toHaveLength(3);
  expect(nest.pieces.flatMap((p) => p.placements)).toHaveLength(17);
  expect(cut.rows.flatMap((r) => r.bom ?? []).some((b) => b.sku === "563H4570B")).toBe(true);
  expect(cut.rows.flatMap((r) => r.bom ?? []).some((b) => b.sku === "71B3550")).toBe(true);
  await page.keyboard.press("Shift+z");
  await page.screenshot({ path: info.outputPath("hardware-demo.png") });
});
