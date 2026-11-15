import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";

// A sheet's job sheet (src/nesting/jobsheet.ts), driven as a person would: a Base cabinet from
// the Cabinet generator, nested on 4 x 4 plywood with CNC spacing; the Nesting section's Job
// sheet for a router sheet, with a box ticked; then CNC files, which saves each sheet's DXF
// followed by its job sheet under the same name ending in " job.txt", listing exactly the
// DXF's layers.

const CABINET = "com.sawhorse3d.cabinet-generator";
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  // io=basic: saves become downloads Playwright can read.
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
}

async function enableCabinet(page: Page) {
  await page.getByRole("tab", { name: "Plugins" }).click();
  const row = page.locator(`.plugin-row[data-plugin="${CABINET}"]`);
  await row.locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Enable" }).click();
  await expect(row).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

/** Files the page downloads while `click` runs (io=basic saves are downloads), in order. */
async function downloads(page: Page, count: number, click: () => Promise<void>): Promise<{ name: string; text: string }[]> {
  const got: Download[] = [];
  const done = new Promise<void>((resolve) => {
    const on = (d: Download) => {
      got.push(d);
      if (got.length === count) {
        page.off("download", on);
        resolve();
      }
    };
    page.on("download", on);
  });
  await click();
  await done;
  return Promise.all(got.map(async (d) => ({ name: d.suggestedFilename(), text: readFileSync((await d.path())!, "utf8") })));
}

/** The layer table of a DXF, but layer 0. */
const layerNames = (text: string) => [...text.matchAll(/\n {2}0\nLAYER\n {2}2\n([^\n]+)/g)].map((m) => m[1]).filter((l) => l !== "0");

test("a router sheet's job sheet in the Nesting section, and one beside each DXF that CNC files saves", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await enableCabinet(page);
  const panel = `${CABINET}/cabinet`;
  await page.locator(`[data-panel="${panel}"] [data-field="preset"]`).selectOption("base");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Base");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.getByRole("button", { name: "Nesting ›" }).click();
  const section = page.getByTestId("nesting");
  await section.getByRole("button", { name: "Stock…" }).click();
  const dlg = page.getByRole("dialog", { name: "Stock" });
  await dlg.getByRole("button", { name: /Use 4 × 4 plywood/ }).click();
  await dlg.getByRole("button", { name: "Done" }).click();
  await section.getByRole("button", { name: "CNC spacing" }).click();
  const row = page.locator('[data-testid="nesting"] > .btnrow');
  await expect(row.getByRole("button", { name: "CNC files" })).toBeEnabled();
  await expect(row).not.toHaveAttribute("data-blocked", "true");

  // CNC setup: the compression bit is the profile bit; the Job sheet tab gives the pockets the
  // down-cut, and the hold-down width is Sawhorse's default.
  await section.getByRole("button", { name: "CNC setup…" }).click();
  const setup = page.getByRole("dialog", { name: "CNC setup" });
  await setup.getByRole("tab", { name: "Tools" }).click();
  await setup.getByLabel("Profile bit: Amana 46170, 1/4 in compression").check();
  await setup.getByRole("tab", { name: "Job sheet" }).click();
  await expect(setup.locator('[data-field="job-pocket"]')).toHaveValue("seed-downcut");
  await expect(setup.getByTestId("hold-down-note")).toContainText("not a standard");
  await setup.getByRole("button", { name: "Done" }).click();

  // The carcass sheet's job sheet: the sides' dados, back groove and holes.
  const sides = section.locator("figure.nest-piece").filter({ has: page.locator('[data-tag]') }).nth(1);
  await sides.getByRole("button", { name: "Job sheet" }).click();
  const js = sides.getByTestId("job-sheet");
  await expect(js).toBeVisible();
  await expect(js.getByTestId("job-file")).toContainText(" CNC.dxf");
  for (const layer of ["STOCK", "LABELS", "PROFILE_THRU", "POCKET_6.35MM", "POCKET_7.94MM"]) await expect(js.locator(`li[data-layer="${layer}"]`)).toBeVisible();
  // The back's 0.227 in groove is too narrow for the 1/4 in down-cut: flagged, and cut with the end mill.
  const groove = js.locator('li[data-layer="POCKET_7.94MM"]');
  await expect(groove.getByTestId("job-warnings")).toContainText("is not narrower than the narrowest shape on this layer");
  await expect(groove.getByTestId("job-bit")).toContainText("1/8 in end mill");
  await expect(js.getByTestId("job-order")).toContainText(/\d bits?, \d tool changes?/);
  const profile = js.locator('li[data-layer="PROFILE_THRU"]');
  await profile.getByRole("checkbox").check();
  await expect(js.getByRole("heading", { name: /Layers: 1 of \d+ with a toolpath/ })).toBeVisible();
  await expect(js.locator('li[data-layer="STOCK"]').getByRole("checkbox")).toBeDisabled();

  // CNC files: each DXF, then its job sheet.
  const n = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: { saw?: boolean }[] };
  const sheets = n.pieces.filter((p) => !p.saw).length;
  const files = await downloads(page, sheets * 2, () => row.getByRole("button", { name: "CNC files" }).click());
  for (let i = 0; i < sheets; i++) {
    const dxf = files[2 * i];
    const job = files[2 * i + 1];
    expect(dxf.name).toMatch(/ CNC\.dxf$/);
    expect(job.name).toBe(dxf.name.replace(/\.dxf$/, " job.txt"));
    expect(job.text).toContain(dxf.name);
    // A tick box for each of the DXF's layers, and no other.
    const ticks = [...job.text.matchAll(/^\[ \] (\S+)/gm)].map((m) => m[1]);
    expect(ticks).toEqual(layerNames(dxf.text));
    expect(job.text).toMatch(/is\s+only\s+what\s+was\s+entered\s+for\s+the\s+stock,\s+not\s+a\s+measurement/);
    expect(job.text).not.toContain("Not in the order");
  }
  await expect(page.locator("#hint")).toContainText("job sheet beside it");
});
