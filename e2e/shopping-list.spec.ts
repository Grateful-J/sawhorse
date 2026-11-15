import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { at, type V3 } from "./helpers";
import { parseCsv } from "../src/cutlist/csv";

// The shopping list, driven as a person would: a cabinet from the Cabinet generator, the Cut
// list's Shopping list opened, the cabinet copied (its hardware doubles) and the copy deleted
// (it halves again), a price typed (the model is not changed by it, and the price is kept on
// this device), the total saying which rows it leaves out, and the CSV saved and read back.

const CABINET = "com.sawhorse3d.cabinet-generator";
const panel = `${CABINET}/cabinet`;
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
  await page.evaluate(() => localStorage.removeItem("sawhorse.shopPrices"));
  await page.getByRole("tab", { name: "Plugins" }).click();
  const row = page.locator(`.plugin-row[data-plugin="${CABINET}"]`);
  await row.locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Enable" }).click();
  await expect(row).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

type GNode = { id: number; parent: number | null };
const tops = async (page: Page) => (await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { nodes: GNode[] } } }).__sawhorse.graph())).nodes.filter((n) => n.parent === null).length;

/** Move+Ctrl the cabinet `d` in along red. */
async function copyRight(page: Page, from: V3, d: number) {
  await page.keyboard.press("m");
  const [x, y] = await at(page, from);
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.click(x, y);
  await page.keyboard.down("Control");
  await page.keyboard.up("Control");
  const [x2, y2] = await at(page, [from[0] + d + 4, from[1], from[2]]);
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.keyboard.type(String(d));
  await page.keyboard.press("Enter");
  await expect.poll(() => tops(page)).toBe(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
}

const shopRow = (page: Page, text: string) => page.locator("[data-testid=shopping] li[data-shop-row]", { hasText: text });

test("the shopping list counts a copied cabinet's hardware and drops a deleted one's; prices are the shop's, not the model's", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  // A door-and-shelf cabinet: one door on two hinges, one loose shelf on four pins.
  const layoutHead = page.locator(`[data-panel="${panel}"] [data-section="secLayout"]`);
  if ((await layoutHead.getAttribute("aria-expanded")) !== "true") await layoutHead.click();
  await page.locator(`[data-panel="${panel}"] [data-field="layout"]`).selectOption("doors");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  // The cabinet is in the model (the status line may show the plugin's words or the batch's).
  await expect.poll(() => tops(page)).toBe(1);

  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.locator(".cutlist .btnrow").getByRole("button", { name: "Shopping list ›" }).click();
  const shop = page.getByTestId("shopping");
  await expect(shop).toBeVisible();
  const hinge = shopRow(page, "71B3550");
  await expect(hinge).toContainText("Needs 2 ·");
  await expect(shopRow(page, "173L8100")).toContainText("Needs 2 ·");
  await expect(shopRow(page, "5 mm shelf pins")).toContainText("Needs 4 ·");
  // Sheets come from the nesting.
  await expect(shop.locator('[data-category="sheet"] li[data-shop-row]').first()).toContainText(/Needs \d+ sheets?/);
  // No price is shipped: every row is unpriced, and the total says so.
  await expect(hinge.getByTestId("shop-cost")).toHaveText("price not set");
  await expect(page.getByTestId("shop-unpriced")).toContainText("No prices yet");

  // Copied: twice the hinges, plates and pins.
  await copyRight(page, [12, 11.6, 34.5], 24);
  await expect(hinge).toContainText("Needs 4 ·");
  await expect(shopRow(page, "5 mm shelf pins")).toContainText("Needs 8 ·");

  // A price typed: costed, kept on this device, and the model untouched.
  const title = await page.title();
  await hinge.getByLabel(/^Price per each: /).fill("4.25");
  await expect(hinge.getByTestId("shop-cost")).toHaveText("$17.00");
  await expect(page.getByTestId("shop-unpriced")).toContainText("The total leaves out");
  await expect(page.getByTestId("shop-unpriced")).not.toContainText("71B3550");
  await expect(page.getByTestId("shop-total")).toContainText("$17.00 with overage");
  expect(await page.title()).toBe(title);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("sawhorse.shopPrices") ?? "{}"));
  expect(kept.prices["sku|71B3550|each"]).toBe(4.25);

  // The copy deleted: back to one cabinet's hardware, and its cost with it.
  const [x, y] = await at(page, [36, 11.6, 30]);
  await page.locator("#cv").focus();
  await page.mouse.click(x, y);
  await page.keyboard.press("Delete");
  await expect.poll(() => tops(page)).toBe(1);
  await expect(hinge).toContainText("Needs 2 ·");
  await expect(hinge.getByTestId("shop-cost")).toHaveText("$8.50");

  // The CSV: the priced row, an unpriced one, and the total naming what it leaves out.
  const [d] = await Promise.all([page.waitForEvent("download"), shop.getByRole("button", { name: "CSV", exact: true }).click()]);
  expect(d.suggestedFilename()).toBe("Untitled shopping list.csv");
  const rows = parseCsv(readFileSync((await d.path())!, "utf8").replace(/^﻿/, ""));
  expect(rows[0][8]).toBe("Unit price (USD)");
  const h = rows.find((r) => r[2] === "71B3550")!;
  expect([h[4], h[8], h[10]]).toEqual(["2", "4.25", "8.50"]);
  expect(rows.find((r) => r[1] === "5 mm shelf pins")![8]).toBe("price not set");
  expect(rows.find((r) => r[0] === "Total")![13]).toMatch(/^Leaves out \d+ rows with no price/);

  // Closing and opening the list keeps the price.
  const btn = page.locator(".cutlist .btnrow").getByRole("button", { name: "Shopping list ‹" });
  await btn.click();
  await expect(shop).toHaveCount(0);
  await page.locator(".cutlist .btnrow").getByRole("button", { name: "Shopping list ›" }).click();
  await expect(hinge.getByLabel(/^Price per each: /)).toHaveValue("4.25");
});
