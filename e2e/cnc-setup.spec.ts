import { expect, test, type Page } from "@playwright/test";
import { box, ready } from "./helpers";

// CNC setup (src/components/CncSetupDialog.tsx), driven as a person would: the Cut list's
// Nesting section, CNC setup…, one feed worked out for the Amana 46170 in raw MDF on the
// Shapeoko 5 Pro 4x4's Compact Router (dial 2, 13,500 RPM, 165 IPM), a compression bit in a
// 1/4 in dado stopped, the profile bit chosen and still chosen after a reload, and the model
// not changed by any of it: the shop is kept on this device, not in the document.

/** A box to nest (the Nesting section opens on a cut list with something in it), then CNC setup. */
async function open(page: Page) {
  await ready(page);
  await box(page);
  await page.getByRole("tab", { name: "Cut list" }).click();
  // The section stays open across a reload (a per-device choice): open it only if it is shut.
  const toggle = page.getByRole("button", { name: /^Nesting [›‹]$/ });
  if ((await toggle.textContent()) === "Nesting ›") await toggle.click();
  await expect(page.getByTestId("nesting")).toBeVisible();
  await page.getByRole("button", { name: "CNC setup…" }).click();
  const dialog = page.getByRole("dialog", { name: "CNC setup" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("CNC setup works out a feed, warns about a shallow compression cut, and keeps the bits on this device", async ({ page }) => {
  const dialog = await open(page);
  const title = await page.title();
  const undo = await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): unknown } }).__sawhorse.graph());

  // Feeds: the seeded compression bit, Baltic birch, a profile.
  await expect(dialog.getByTestId("feeds-on")).toContainText("Shapeoko 5 Pro 4×4, Carbide Compact Router (Carbide's shop page)");
  await expect(dialog.getByTestId("feed")).toContainText("113 IPM");
  await dialog.getByRole("combobox", { name: "Material" }).selectOption("mdf");
  await expect(dialog.getByTestId("speed")).toContainText("Dial 2: 13,500 RPM");
  await expect(dialog.getByTestId("feed")).toContainText("165 IPM (4,183 mm/min)");
  await expect(dialog.getByTestId("ramp")).toContainText("82 IPM");
  await expect(dialog.getByTestId("maker-range")).toContainText("times apart");
  await expect(dialog.getByTestId("find-your-number").locator("li")).toHaveCount(7);

  // A 1/4 in dado with the compression bit: the up-cut part cuts it.
  await dialog.getByRole("combobox", { name: "Cut" }).selectOption("pocket");
  await dialog.getByLabel("Pocket depth").fill("1/4");
  await dialog.getByLabel("Pocket depth").press("Enter");
  await expect(dialog.locator('[data-warning="compression-first-pass"]')).toHaveAttribute("data-level", "stop");

  // Machine: Carbide's two dial tables, and the low-confidence feed limit.
  await dialog.getByRole("tab", { name: "Machine" }).click();
  await expect(dialog.getByTestId("dial-gap")).toContainText("dial 5: 2,250 RPM");
  await expect(dialog.getByTestId("feed-warn")).toContainText("Not published by Carbide; forum figure 200 IPM");

  // Tools: the 1/8 in end mill is the profile bit.
  await dialog.getByRole("tab", { name: "Tools" }).click();
  await dialog.getByLabel("Profile bit: 1/8 in end mill").check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  // Shop data: kept on this device; the model and its title are as they were.
  expect(await page.title()).toBe(title);
  expect(await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): unknown } }).__sawhorse.graph())).toEqual(undo);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("sawhorse.cam.shop") ?? "null"));
  expect(kept.profileTool).toBe("seed-endmill");
  const again = await open(page);
  await again.getByRole("tab", { name: "Tools" }).click();
  await expect(again.getByLabel("Profile bit: 1/8 in end mill")).toBeChecked();
});
