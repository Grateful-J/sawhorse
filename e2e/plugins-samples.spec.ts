import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { box, hover, at, IN, solids, type V3 } from "./helpers";

// The three sample plugins (plugins/), driven through the UI as a person would (lane 11):
// enabled from the Plugins pane after the permission dialog, the cabinet generator's panel,
// the shelf-pin tool on the rail, and the model report's live counts and export.

const CABINET = "com.sawhorse3d.cabinet-generator";
const PINS = "com.sawhorse3d.shelf-pin-holes";
const REPORT = "com.sawhorse3d.model-report";
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  // io=basic: saves become downloads Playwright can read.
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
}

const row = (page: Page, id: string) => page.locator(`.plugin-row[data-plugin="${id}"]`);

/** Enable a sample from the Plugins pane, through the permission dialog. */
async function enable(page: Page, id: string, name: string, permissions: string[]) {
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(row(page, id)).toHaveAttribute("data-status", "disabled");
  await row(page, id).locator('[data-do="enable"]').click();
  const dialog = page.getByRole("dialog", { name: `Enable ${name}` });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("li[data-permission]")).toHaveCount(permissions.length);
  for (const p of permissions) await expect(dialog.locator(`li[data-permission="${p}"]`)).toBeVisible();
  await dialog.getByRole("button", { name: "Enable" }).click();
  await expect(row(page, id)).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

/** The cabinet panel's group each field is in: it must be open to type into the field. */
const SECTION_OF: Record<string, string> = { width: "secSize", height: "secSize", depth: "secSize", layout: "secLayout", shelves: "secLayout", shelfType: "secLayout", drawers: "secLayout", joinery: "secBuild" };

/** Open a plugin panel's group (a section heading) if it is closed. */
async function openSection(page: Page, panel: string, id: string) {
  const head = page.locator(`[data-panel="${panel}"] [data-section="${id}"]`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}

/** Pick a value in a plugin panel's select, opening its group first. */
async function choose(page: Page, panel: string, id: string, value: string) {
  if (SECTION_OF[id]) await openSection(page, panel, SECTION_OF[id]);
  await page.locator(`[data-panel="${panel}"] [data-field="${id}"]`).selectOption(value);
}

/** Type into a plugin panel's field and commit it (Enter), opening its group first. */
async function field(page: Page, panel: string, id: string, value: string) {
  if (SECTION_OF[id]) await openSection(page, panel, SECTION_OF[id]);
  const input = page.locator(`[data-panel="${panel}"] [data-field="${id}"]`);
  await input.fill(value);
  await input.press("Enter");
}

test("the samples are listed, disabled, with their permissions", async ({ page }) => {
  await start(page);
  await page.getByRole("tab", { name: "Plugins" }).click();
  for (const [id, perms] of [
    [CABINET, ["model.read", "model.write", "ui", "storage"]],
    [PINS, ["model.read", "model.write", "ui", "storage"]],
    [REPORT, ["model.read", "ui", "file", "storage"]],
  ] as const) {
    await expect(row(page, id)).toHaveAttribute("data-status", "disabled");
    await expect(row(page, id).locator(".plugin-state")).toHaveText("Off");
    await expect(row(page, id).locator(".plugin-chips li")).toHaveText([...perms]);
    await expect(row(page, id)).toContainText("sample · Sawhorse · MIT");
  }
  // Cancel leaves it off.
  await row(page, CABINET).locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, CABINET)).toHaveAttribute("data-status", "disabled");
});

test("cabinet generator: a 30 x 72 x 12 in cabinet with 3 shelves; the Outliner names the parts and the Cut list lists them", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  await expect(page.locator(`[data-panel="${panel}"] summary`)).toContainText("Cabinet generator");
  await field(page, panel, "width", "30");
  await field(page, panel, "height", "72");
  await field(page, panel, "depth", "12");
  await field(page, panel, "shelves", "3");
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Adds Cabinet 1: 30 × 72 × 12, open, 3 adjustable shelves");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1: Left side, Right side, Top, Bottom, Shelf x 3, Back, Toe kick");

  // Nine parts, the whole cabinet 30 x 12 x 72 in.
  const s = await solids(page);
  expect(s).toHaveLength(9);
  const lo = [0, 1, 2].map((k) => Math.min(...s.map((x) => x.min[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...s.map((x) => x.max[k])));
  expect(hi.map((h, k) => h - lo[k]).map((d) => Math.round(d * 1e6) / 1e6)).toEqual([30, 12, 72]);
  // It is selected, so the panel edits it (changes apply as they are made); the button adds another.
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Editing Cabinet 1");
  await expect(page.locator(`[data-panel="${panel}"] [data-action="generate"]`)).toHaveText("Add another like this");

  // The Outliner: the cabinet, unfolded, shows its named parts.
  await page.getByRole("tab", { name: "Outliner" }).click();
  const cab = page.locator('.outline li[data-kind="instance"]', { hasText: "Cabinet" }).first();
  await expect(cab).toBeVisible();
  await cab.getByRole("button", { name: "Unfold Cabinet" }).click();
  for (const name of ["Left side", "Right side", "Top", "Bottom", "Shelf 1", "Shelf 2", "Shelf 3", "Back", "Toe kick"]) await expect(page.locator(".outline li .label", { hasText: new RegExp(`^${name}$`) })).toHaveCount(1);

  // The Cut list reads the parts straight away.
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.locator(".cutlist table")).toBeVisible();
  const rows = await page.locator(".cutlist table tbody tr").evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => ((td.querySelector(".name") ?? td).textContent ?? "").trim())));
  const byName = Object.fromEntries(rows.map((r) => [r[0], r.slice(1, 5)]));
  // Drawn at the measured 23/32 in (the list shows its nominal 3/4); the top and bottom are
  // 30 - 2 x 23/32 between the sides plus a tongue into each side's blind dado (1/4 in less
  // 0.5 mm): 29 in. The back sits in grooves 1/2 in from the rear: the top and bottom run to
  // the rear edge, a shelf stops at the back (12 - 1/2 - 7/32 - 1/32 = 11 1/4). The shelves
  // are adjustable, loose on pins: 1/32 in short of each side (28 1/2).
  expect(byName["Left side"]).toEqual(["1", "3/4", "12", "72"]);
  expect(byName["Right side"]).toEqual(["1", "3/4", "12", "72"]);
  expect(byName["Top"]).toEqual(["1", "3/4", "12", "29"]);
  expect(byName["Bottom"]).toEqual(["1", "3/4", "12", "29"]);
  expect(byName["Shelf"]).toEqual(["3", "3/4", "11 1/4", "28 1/2"]);
  expect(byName["Back"]).toEqual(["1", "1/4", "29 1/8", "67 1/8"]);
  expect(byName["Toe kick"]).toEqual(["1", "3/4", "4", "28 9/16"]);
  // One undo step takes the whole cabinet back.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await solids(page)).length).toBe(0);
  await expect(page.locator("#hint")).toContainText("Undone: Generate cabinet");
});

test("cabinet generator: a drawer cabinet and a door cabinet", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  await choose(page, panel, "layout", "drawers");
  await field(page, panel, "drawers", "2");
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("2 drawers");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Drawer front x 2");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.locator(".cutlist table")).toBeVisible();
  const names = () => page.locator(".cutlist table tbody tr").evaluateAll((trs) => trs.map((tr) => ((tr.querySelector(".name") ?? tr.querySelector("td"))?.textContent ?? "").trim()));
  expect(await names()).toEqual(expect.arrayContaining(["Drawer front", "Drawer side", "Drawer bottom"]));
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await solids(page)).length).toBe(0);

  await page.getByRole("tab", { name: "Plugins" }).click();
  await choose(page, panel, "layout", "doors");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText(/Made Cabinet \d: Door/);
  await page.getByRole("tab", { name: "Cut list" }).click();
  await expect(page.locator(".cutlist table")).toBeVisible();
  const doorNames = await names();
  expect(doorNames).toContain("Door");
  expect(doorNames).not.toContain("Drawer front");
});

test("cabinet generator: the selected cabinet changes as its settings do, in place, one undo step each; empty space starts a new one", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const status = page.locator(`[data-panel="${panel}"] [data-note="status"]`);
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1");
  const first = await solids(page);
  // No Update button: the change is the update.
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(first.length + 1);
  const second = await solids(page);
  // Same place: the same overall box.
  const box = (ss: typeof first) => [0, 1, 2].map((k) => [Math.min(...ss.map((x) => x.min[k])), Math.max(...ss.map((x) => x.max[k]))].map((v) => Math.round(v * 1e6) / 1e6));
  expect(box(second)).toEqual(box(first));
  await expect(status).toContainText("Editing Cabinet 1");
  // Empty space: a new cabinet, numbered on, beside the first.
  const vp = (await page.locator("main.vp").boundingBox())!;
  await page.keyboard.press("Escape");
  await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  await expect(status).toContainText("Adds Cabinet 2");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 2");
  // Clicking the first cabinet again shows its own settings: two shelves.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Cabinet 1" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(status).toContainText("Editing Cabinet 1");
  await expect(page.locator(`[data-panel="${panel}"] [data-field="shelves"]`)).toHaveValue("2");
});

test("cabinet generator: new cabinets stand in a row; the row goes on a base frame with its own cut list, toe kicks off", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const rows = `${CABINET}/rows`;
  const vp = (await page.locator("main.vp").boundingBox())!;
  const empty = async () => {
    await page.keyboard.press("Escape");
    await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  };
  const extent = (ss: Awaited<ReturnType<typeof solids>>) => [0, 1, 2].map((k) => Math.round((Math.max(...ss.map((x) => x.max[k])) - Math.min(...ss.map((x) => x.min[k]))) * 1e4) / 1e4);
  // Three cabinets, 24, 18 and 36 in wide (open shelves, the toe kick on): each goes right of the last.
  await field(page, panel, "width", "24");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1");
  for (const [w, n] of [["18", 2], ["36", 3]] as const) {
    await empty();
    await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText(`Adds Cabinet ${n}`);
    await expect(page.locator(`[data-panel="${panel}"] [data-field="place"]`)).toHaveValue("right");
    await field(page, panel, "width", w);
    await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
    await expect(page.locator("#hint")).toContainText(`Made Cabinet ${n}`);
  }
  // Side by side, backs in line: 78 x 23 1/4 x 34 1/2 in all told.
  const cabinets = await solids(page);
  expect(extent(cabinets)).toEqual([78, 23.25, 34.5]);

  // The middle cabinet selected: the rows panel names its row and plans its frame.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Cabinet 2" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(page.locator(`[data-panel="${rows}"] [data-note="row"]`)).toContainText("Row of 3: Cabinet 1, Cabinet 2, Cabinet 3 · 78 long");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("2 ladders");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("toe kicks come off");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("Tops at 34 1/2 above the floor");
  // Ladders break at the joint between the 18 and the 36: 42 and 36 in, each inside a 4 x 4 sheet.
  const cuts = page.locator(`[data-panel="${rows}"] [data-table="baseCuts"] tbody tr`);
  await expect(cuts.first()).toContainText("Base back rail");
  const table = await cuts.evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim())));
  expect(table.slice(0, 4).map((r) => [r[0], r[1], r[2], r[3]])).toEqual([
    ["Base back rail", "1", "42", "4"],
    ["Base front rail", "1", "42", "4"],
    ["Base back rail", "1", "36", "4"],
    ["Base front rail", "1", "36", "4"],
  ]);
  expect(table[4][0]).toBe("Base sleeper");

  // On the frame: one undo step; the toe kicks are gone and the tops stay at 34 1/2.
  await page.locator(`[data-panel="${rows}"] [data-action="makeBase"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Base frame 1 under 3 cabinets");
  const after = await solids(page);
  expect(extent(after)).toEqual([78, 23.25, 34.5]);
  const sleepers = Number(table[4][1]);
  // Each cabinet loses its toe kick; the frame adds 4 rails and the sleepers.
  expect(after.length).toBe(cabinets.length - 3 + 4 + sleepers);
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("Changes apply as you make them");
  // A taller frame lifts the row: the tops go up with it.
  await page.locator(`[data-panel="${rows}"] [data-field="height"]`).fill("5");
  await page.locator(`[data-panel="${rows}"] [data-field="height"]`).press("Enter");
  await expect.poll(async () => extent(await solids(page))[2]).toBe(35.5);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#hint")).toContainText("Undone: Update base frame");
  await expect.poll(async () => extent(await solids(page))[2]).toBe(34.5);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#hint")).toContainText("Undone: Base frame");
  await expect.poll(async () => (await solids(page)).length).toBe(cabinets.length);
});

/** Files the page downloads while `click` runs (io=basic saves are downloads). */
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

test("mixed CNC and track saw: a pantry too tall for a 4 x 4 goes to the saw, the CNC files are the router's, its dados are hand work", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  await page.locator(`[data-panel="${panel}"] [data-field="preset"]`).selectOption("tall");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Pantry");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.getByRole("button", { name: "Nesting ›" }).click();
  const section = page.getByTestId("nesting");
  await section.getByRole("button", { name: "Stock…" }).click();
  const dlg = page.getByRole("dialog", { name: "Stock" });
  await dlg.getByRole("button", { name: /Use 4 × 4 plywood/ }).click();
  await dlg.getByRole("button", { name: "Done" }).click();
  await section.getByRole("button", { name: "CNC spacing" }).click();
  // 84 in sides and back: on no stock, with the offer to cut them on the track saw.
  await expect(page.getByTestId("nest-unplaced")).toContainText("Left side");
  await page.getByTestId("nest-unplaced").getByRole("button", { name: /on the track saw/ }).click();
  await expect(page.getByTestId("nest-unplaced")).toHaveCount(0);
  await expect(section.locator('[data-field="overflow"]')).toBeChecked();
  const saw = section.locator('figure.nest-piece[data-saw="true"]');
  await expect(saw.first()).toBeVisible();
  await expect(saw.first().locator(".via")).toHaveText("Track saw");
  await expect(section.locator("figure.nest-piece:not([data-saw]) .via").first()).toHaveText("CNC");
  const n = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: { saw?: boolean; stock: string; placements: { name: string }[] }[] };
  const sawn = n.pieces.filter((p) => p.saw);
  expect(sawn.every((p) => p.stock.startsWith("4 x 8"))).toBe(true);
  expect(sawn.flatMap((p) => p.placements.map((q) => q.name))).toEqual(expect.arrayContaining(["Left side", "Right side"]));
  // The sides' shelf-pin and hinge-plate holes and back groove: hand work.
  await expect(page.getByTestId("nest-handwork")).toContainText("Left side");
  // CNC files: one per router sheet, the hand work list, then one file of job sheets.
  const router = n.pieces.filter((p) => !p.saw).length;
  const files = await downloads(page, router + 2, async () => {
    await section.getByRole("button", { name: "CNC files" }).click();
    await page.getByRole("dialog", { name: "The nesting has problems" }).getByRole("button", { name: "Save the CNC files anyway" }).click();
  });
  expect(files.filter((f) => / job sheets \d{4}-\d\d-\d\d\.txt$/.test(f.name))).toHaveLength(1);
  const dxfs = files.filter((f) => f.name.endsWith(".dxf"));
  expect(dxfs).toHaveLength(router);
  expect(dxfs.every((f) => !/Left side|Right side/.test(f.name))).toBe(true);
  const work = files.find((f) => f.name.endsWith("track saw hand work.txt"));
  expect(work?.text).toContain("hand work on the track saw's parts");
  // The entry names its sheet as the Nesting section does, material and all.
  expect(work?.text).toMatch(/Left side \(Sheet \d of \d · 4 x 8 sheet, 3\/4 · Cabinet plywood\)/);
  expect(work?.text).toContain("How to read a position");
  expect(work?.text).toContain("Lengths in inches, to the nearest 1/64 in; hole sizes in millimetres.");
  expect(work?.text).toMatch(/holes? 5 mm/);
  await expect(page.locator("#hint")).toContainText("Saved the hand work on");
  // One undo takes the saw back off.
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("nest-unplaced")).toContainText("Left side");
});

/** A cabinet from a starting point, then the Cut list's Nesting section on 4 x 4 plywood. */
async function nestedOnFourByFour(page: Page, presets: string[], before?: (panel: string) => Promise<void>) {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  if (before) await before(panel);
  for (const preset of presets) {
    await page.getByRole("tab", { name: "Plugins" }).click();
    await page.locator(`[data-panel="${panel}"] [data-field="preset"]`).selectOption(preset);
    await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
    await expect(page.locator("#hint")).toContainText("Made ");
  }
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.getByRole("button", { name: "Nesting ›" }).click();
  const section = page.getByTestId("nesting");
  await section.getByRole("button", { name: "Stock…" }).click();
  const dlg = page.getByRole("dialog", { name: "Stock" });
  await dlg.getByRole("button", { name: /Use 4 × 4 plywood/ }).click();
  await dlg.getByRole("button", { name: "Done" }).click();
  await expect(section.locator('[data-field="overflow"]')).toBeVisible();
  return section;
}

/** The nesting on screen is of the model as it is: the file buttons are on. */
async function nestingSettled(page: Page) {
  const row = page.locator('[data-testid="nesting"] > .btnrow');
  await expect(row.getByRole("button", { name: "CNC files" })).toBeEnabled();
  await expect(row).not.toHaveAttribute("data-blocked", "true");
}

type Settings = { kerf: number; trim: number; algorithm: string; overflow?: { kerf: number; trim: number } | null };
const settingsNow = (page: Page) => page.evaluate(async () => ((await (window as unknown as { __sawhorse: { nest(): Promise<{ settings: unknown }> } }).__sawhorse.nest()).settings as never)) as Promise<Settings>;

test("nesting settings changed one right after the other both land: CNC spacing then the track saw, Kerf then Trim, Saw kerf then Saw trim", async ({ page }) => {
  test.setTimeout(120_000);
  const IN = 0.0254;
  const section = await nestedOnFourByFour(page, ["tall"]);
  await nestingSettled(page);
  // Both clicked in one task: neither has reached the kernel when the other is asked for.
  await page.evaluate(() => {
    const sec = document.querySelector('[data-testid="nesting"]')!;
    (Array.from(sec.querySelectorAll("button")).find((b) => b.textContent?.trim() === "CNC spacing") as HTMLButtonElement).click();
    (sec.querySelector('[data-field="overflow"]') as HTMLInputElement).click();
  });
  await expect(section.locator('[data-field="overflow"]')).toBeChecked();
  await expect.poll(async () => (await settingsNow(page)).algorithm).toBe("maxrects");
  let st = await settingsNow(page);
  expect(st.kerf).toBeCloseTo(0.375 * IN, 9);
  expect(st.trim).toBeCloseTo(0.5 * IN, 9);
  expect(st.overflow?.kerf).toBeCloseTo(IN / 8, 9);
  await nestingSettled(page);

  // Two fields typed, then Enter on each in one task.
  const typeBoth = (a: [string, string], b: [string, string]) =>
    page.evaluate(
      ([a, b]) => {
        const sec = document.querySelector('[data-testid="nesting"]')!;
        const type = ([label, v]: string[]) => {
          const el = sec.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return el;
        };
        const fields = [type(a), type(b)];
        return new Promise<void>((done) =>
          requestAnimationFrame(() => {
            for (const el of fields) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            done();
          }),
        );
      },
      [a, b],
    );
  await typeBoth(["Kerf", "5/16"], ["Trim", "3/4"]);
  await expect.poll(async () => (await settingsNow(page)).trim).toBeCloseTo(0.75 * IN, 9);
  st = await settingsNow(page);
  expect(st.kerf).toBeCloseTo((5 / 16) * IN, 9);
  expect(st.algorithm).toBe("maxrects");
  expect(st.overflow).toBeTruthy();
  await nestingSettled(page);

  await typeBoth(["Saw kerf", "3/32"], ["Saw trim", "1/2"]);
  await expect.poll(async () => (await settingsNow(page)).overflow?.trim).toBeCloseTo(0.5 * IN, 9);
  st = await settingsNow(page);
  expect(st.overflow?.kerf).toBeCloseTo((3 / 32) * IN, 9);
  // And the router's own are as they were.
  expect(st.kerf).toBeCloseTo((5 / 16) * IN, 9);
  expect(st.trim).toBeCloseTo(0.75 * IN, 9);

  // The saw off and on again keeps the kerf and trim typed for it.
  await nestingSettled(page);
  await section.locator('[data-field="overflow"]').click();
  await expect(section.locator('[data-field="overflow"]')).not.toBeChecked();
  await expect.poll(async () => (await settingsNow(page)).overflow ?? null).toBeNull();
  await section.locator('[data-field="overflow"]').click();
  await expect(section.locator('[data-field="overflow"]')).toBeChecked();
  await expect.poll(async () => (await settingsNow(page)).overflow?.kerf).toBeCloseTo((3 / 32) * IN, 9);
  expect((await settingsNow(page)).overflow?.trim).toBeCloseTo(0.5 * IN, 9);
});

test("CNC files are not saved from a nesting the model has moved on from: an undo and the button at once saves nothing, then the new nesting saves its own files", async ({ page }) => {
  test.setTimeout(120_000);
  const section = await nestedOnFourByFour(page, ["base"]);
  await section.getByRole("button", { name: "CNC spacing" }).click();
  await nestingSettled(page);
  // A second cabinet, made last, so one undo takes it (and nothing else) away again.
  const panel = `${CABINET}/cabinet`;
  const vp = (await page.locator("main.vp").boundingBox())!;
  await page.getByRole("tab", { name: "Plugins" }).click();
  await page.keyboard.press("Escape");
  await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Adds ");
  await page.locator(`[data-panel="${panel}"] [data-field="preset"]`).selectOption("drawers");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Drawer base");
  await page.getByRole("tab", { name: "Cut list" }).click();
  await nestingSettled(page);
  const before = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: { placements: { name: string }[] }[] };
  const drawerParts = (n: { pieces: { placements: { name: string }[] }[] }) => n.pieces.flatMap((p) => p.placements.map((q) => q.name)).filter((name) => /^Drawer/.test(name)).length;
  expect(drawerParts(before)).toBeGreaterThan(5);
  const got: Download[] = [];
  page.on("download", (d) => got.push(d));
  // Undo the drawer cabinet and click CNC files in the same task: the nesting on screen still
  // has the drawer cabinet's parts, the model will not.
  await page.evaluate(() => {
    const w = window as unknown as { __hints: string[]; __offAtUndone?: boolean };
    w.__hints = [];
    const hint = document.querySelector("#hint")!;
    const btn = Array.from(document.querySelectorAll('[data-testid="nesting"] > .btnrow button')).find((b) => b.textContent?.trim() === "CNC files") as HTMLButtonElement;
    new MutationObserver(() => {
      const text = hint.textContent ?? "";
      w.__hints.push(text);
      // The render that says Undone already has the button off.
      if (/Undone/.test(text) && w.__offAtUndone === undefined) w.__offAtUndone = btn.disabled;
    }).observe(hint, { childList: true, subtree: true, characterData: true });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    btn.click();
  });
  await expect(page.locator("#hint")).toContainText("Undone");
  await nestingSettled(page);
  const seen = await page.evaluate(() => ({ hints: (window as unknown as { __hints: string[] }).__hints, off: (window as unknown as { __offAtUndone?: boolean }).__offAtUndone }));
  expect(seen.hints.some((h) => /Nothing was saved: the model changed and the nesting is being worked out again/.test(h))).toBe(true);
  expect(seen.off).toBe(true);
  expect(got).toHaveLength(0);
  // The nesting of the model as it is now: one cabinet, and its files only.
  const after = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: { saw?: boolean; placements: { name: string }[] }[] };
  expect(drawerParts(after)).toBe(0);
  expect(after.pieces.length).toBeLessThan(before.pieces.length);
  // The DXFs, then one file of job sheets.
  const files = await downloads(page, after.pieces.length + 1, async () => {
    await section.getByRole("button", { name: "CNC files" }).click();
    await page.getByRole("dialog", { name: "The nesting has problems" }).getByRole("button", { name: "Save the CNC files anyway" }).click();
  });
  const dxfs = files.filter((f) => f.name.endsWith(".dxf"));
  expect(dxfs).toHaveLength(after.pieces.length);
  expect(dxfs.every((f) => !/Drawer base/.test(f.name))).toBe(true);
  expect(files[files.length - 1].name).toMatch(/ job sheets \d{4}-\d\d-\d\d\.txt$/);
  await expect(page.locator("#hint")).toContainText(`Saved ${after.pieces.length} CNC files`);
  expect(got).toHaveLength(after.pieces.length + 1);
});

test("a cabinet drawn at a thickness its sheets are not is asked about before any CNC file is written; saving anyway is not an error; a material keeps its own stock and the status says so", async ({ page }) => {
  test.setTimeout(120_000);
  // Drawn at 3/4 in: the 4 x 4 plywood the button adds is 23/32.
  const section = await nestedOnFourByFour(page, ["base"], async (panel) => {
    await openSection(page, panel, "secMaterials");
    const input = page.locator(`[data-panel="${panel}"] [data-field="thickness"]`);
    await input.fill("3/4");
    await input.press("Enter");
  });
  // A material with a stock of its own, of another size, is not moved to the 4 x 4 by the
  // button: the status names it.
  await section.getByRole("button", { name: "Stock…" }).click();
  const dlg = page.getByRole("dialog", { name: "Stock" });
  await dlg.getByLabel("Stock for Cabinet plywood").selectOption("4 x 8 sheet, 3/4");
  await expect(page.locator("#hint")).toContainText("come from");
  await dlg.getByRole("button", { name: /Use 4 × 4 plywood/ }).click();
  await expect(page.locator("#hint")).toContainText("Cabinet plywood keeps its own stock, which is another size");
  await dlg.getByLabel("Stock for Cabinet plywood").selectOption("");
  await expect(page.locator("#hint")).toContainText("stock chosen automatically");
  await dlg.getByRole("button", { name: "Done" }).click();
  await section.getByRole("button", { name: "CNC spacing" }).click();
  await nestingSettled(page);
  const got: Download[] = [];
  page.on("download", (d) => got.push(d));
  await section.getByRole("button", { name: "CNC files" }).click();
  const ask = page.getByRole("dialog", { name: "The nesting has problems" });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("3/4 in parts");
  await expect(ask).toContainText("4 x 4 sheet, 3/4 is 23/32 in, 1/32 in thinner. Joints will be loose.");
  await expect(ask.getByRole("button", { name: "My sheets are as drawn" })).toBeVisible();
  expect(got).toHaveLength(0);
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  expect(got).toHaveLength(0);
  // Saving anyway writes the files, and the status line does not call that a mistake.
  const n = (await page.evaluate(async () => (await (window as unknown as { __sawhorse: { nest(): Promise<unknown> } }).__sawhorse.nest()) as never)) as { pieces: unknown[] };
  const files = await downloads(page, n.pieces.length + 1, async () => {
    await section.getByRole("button", { name: "CNC files" }).click();
    await ask.getByRole("button", { name: "Save the CNC files anyway" }).click();
  });
  expect(files.filter((f) => f.name.endsWith(".dxf"))).toHaveLength(n.pieces.length);
  expect(files.filter((f) => f.name.endsWith(".txt"))).toHaveLength(1);
  await expect(page.locator("#hint")).toContainText(`Saved ${n.pieces.length} CNC files`);
  await expect(page.locator("#hint")).toContainText("3/4 in parts");
  await expect(page.locator("#hint")).not.toContainText("Can't do that");
});

test("base frame: drawn dimensioned in the panel and in the model before it is made, a click makes it, the Cut list groups it, long rails on the track saw", async ({ page }) => {
  test.setTimeout(120_000);
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const rows = `${CABINET}/rows`;
  const vp = (await page.locator("main.vp").boundingBox())!;
  for (const [w, n] of [["24", 1], ["18", 2], ["36", 3]] as const) {
    if (n > 1) {
      await page.keyboard.press("Escape");
      await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
      await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText(`Adds Cabinet ${n}`);
    }
    await field(page, panel, "width", w);
    await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
    await expect(page.locator("#hint")).toContainText(`Made Cabinet ${n}`);
  }
  // The last one is selected: its row's frame, drawn and laid out.
  const pic = page.locator(`[data-panel="${rows}"] img`);
  await expect.poll(async () => ((await pic.getAttribute("src")) ?? "").length).toBeGreaterThan(2000);
  expect(await pic.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  const layout = page.locator(`[data-panel="${rows}"] [data-table="ladderLayout"] tbody tr`);
  await expect(layout).toHaveCount(2);
  await expect(layout.nth(0)).toContainText("A");
  await expect(layout.nth(0)).toContainText("42");
  await expect(layout.nth(1)).toContainText("36");
  // In the model: the preview tool, then a click makes it.
  const before = (await solids(page)).length;
  await page.locator(`[data-panel="${rows}"] [data-action="previewBase"]`).click();
  await expect(page.locator("#hint")).toContainText("The base frame for 3 cabinets");
  expect((await solids(page)).length).toBe(before);
  await page.mouse.click(vp.x + vp.width / 2, vp.y + vp.height / 2);
  // Made, one undo step, and selected: the tool now shows the frame as its settings make it.
  await expect(page.locator("#hint")).toContainText("Base frame 1 as its settings now make it");
  await expect.poll(async () => (await solids(page)).length).toBeGreaterThan(before);
  // The Cut list, by assembly: a heading per cabinet and the frame.
  await page.getByRole("tab", { name: "Cut list" }).click();
  await page.locator('.cutlist [data-field="byAssembly"]').check();
  const heads = page.locator(".cutlist tbody tr.group");
  await expect(heads).toHaveCount(4);
  const names = await heads.evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-group")));
  expect([...names].sort()).toEqual(["Base frame 1", "Cabinet 1", "Cabinet 2", "Cabinet 3"]);
  const frameRows = page.locator('.cutlist tbody tr.group[data-group="Base frame 1"] ~ tr[data-part^="Base "]');
  await expect(frameRows.first()).toBeVisible();
  // Long rails on the track saw: one 78 in ladder, and the panel says where the rails go.
  await page.getByRole("tab", { name: "Plugins" }).click();
  await page.locator(`[data-panel="${rows}"] [data-field="stock"]`).selectOption("saw");
  await expect(page.locator(`[data-panel="${rows}"] [data-table="ladderLayout"] tbody tr`)).toHaveCount(1);
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("Changes apply as you make them");
  await expect(page.locator(`[data-panel="${rows}"] [data-table="baseCuts"] tbody tr`).first()).toContainText("78");
});

test("cabinet generator: a wider cabinet moves its row along; Line up butts cabinets together; a cabinet turns the corner", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const rows = `${CABINET}/rows`;
  const vp = (await page.locator("main.vp").boundingBox())!;
  const empty = async () => {
    await page.keyboard.press("Escape");
    await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
    await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Adds");
  };
  const make = async (n: number, width: string) => {
    await field(page, panel, "width", width);
    await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
    await expect(page.locator("#hint")).toContainText(`Made Cabinet ${n}`);
  };
  const outline = (name: string) => page.locator('.outline li[data-kind="instance"]', { hasText: name }).first().locator(".label").first();
  const extent = async () => {
    const ss = await solids(page);
    return [0, 1, 2].map((k) => Math.round((Math.max(...ss.map((x) => x.max[k])) - Math.min(...ss.map((x) => x.min[k]))) * 1e4) / 1e4);
  };
  await make(1, "24");
  await empty();
  await make(2, "18");
  expect((await extent())[0]).toBe(42);
  // Cabinet 1 made 6 in wider: Cabinet 2 moves along with its side.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await outline("Cabinet 1").click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Editing Cabinet 1");
  await field(page, panel, "width", "30");
  await expect.poll(async () => (await extent())[0]).toBe(48);
  // Made shallower, it keeps its back on the wall: still in the row with Cabinet 2.
  await field(page, panel, "depth", "12");
  await expect(page.locator(`[data-panel="${CABINET}/rows"] [data-note="row"]`)).toContainText("Row of 2: Cabinet 1, Cabinet 2");
  expect((await extent())[1]).toBe(23.25);
  await field(page, panel, "depth", "23 1/4");
  await expect(page.locator(`[data-panel="${CABINET}/rows"] [data-note="row"]`)).toContainText("23 1/4 deep");
  // One apart, 2 in off the end; then lined up against the row.
  await empty();
  await choose(page, panel, "place", "apart");
  await make(3, "15");
  expect((await extent())[0]).toBe(65);
  await page.getByRole("tab", { name: "Outliner" }).click();
  await outline("Cabinet 2").click();
  await outline("Cabinet 3").click({ modifiers: ["Shift"] });
  await page.getByRole("tab", { name: "Plugins" }).click();
  await page.locator(`[data-panel="${rows}"] [data-action="lineUp"]`).click();
  await expect(page.locator("#hint")).toContainText("Lined up 2 cabinets");
  await expect.poll(async () => (await extent())[0]).toBe(63);
  await expect(page.locator(`[data-panel="${rows}"] [data-note="row"]`)).toContainText("Row of 3: Cabinet 1, Cabinet 2, Cabinet 3 · 63 long");
  // Around the corner at the right end: its back on the next wall, 3 in in front of the row's carcass.
  await empty();
  await choose(page, panel, "place", "cornerRight");
  await make(4, "24");
  expect(await extent()).toEqual([63, 23.25 + 27, 34.5]);
  // The row goes on down the new wall from there.
  await expect(page.locator(`[data-panel="${panel}"] [data-field="place"]`)).toHaveValue("right");
});

// Lane 28 (#34, #21): Generate pressed again with the cabinet selected ("Update selected
// cabinet") deletes the old cabinet and makes a new one in its slots, and Explode removes
// the cabinet's instance; either left ids the file reader numbered afresh, so Ctrl+S said
// "Could not save: the file did not read back as written: the model differs", and kept
// saying it for every edit after. Each is saved here, opened again, and must be the same
// model; the cabinet the plugin keeps in the document is still the one it updates.
async function saveAndReopen(page: Page) {
  const vp = page.locator("main.vp");
  const hash = await vp.getAttribute("data-hash");
  const [d] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  await expect(page.locator("#hint")).toContainText(/Saved (Untitled|cabinet)\.shz/);
  const bytes = readFileSync((await d.path())!);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await expect.poll(async () => (await solids(page)).length).toBe(0);
  await page.getByTestId("file-input").setInputFiles({ name: "cabinet.shz", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page).toHaveTitle("cabinet - Sawhorse");
  await expect(vp).toHaveAttribute("data-hash", hash!);
}

test("cabinet generator: a cabinet updated in place saves and opens as the same model, and Update still finds it (#34)", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const generate = page.locator(`[data-panel="${panel}"] [data-action="generate"]`);
  await generate.click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1");
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(8);
  await saveAndReopen(page);
  expect(await solids(page)).toHaveLength(8);
  // The plugin's settings kept in the document name the reopened cabinet: selected, the panel
  // shows its settings and edits it.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Cabinet" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(page.locator(`[data-panel="${panel}"] [data-note="status"]`)).toContainText("Editing Cabinet 1");
  await field(page, panel, "shelves", "3");
  await expect.poll(async () => (await solids(page)).length).toBe(9);
  // And the model saves again.
  await saveAndReopen(page);
});

test("cabinet generator: a cabinet exploded and its parts grouped saves and opens as the same model (#21)", async ({ page }) => {
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  await page.locator(`[data-panel="${CABINET}/cabinet"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1");
  // The new cabinet is selected: Ctrl+Shift+G explodes it into its parts.
  await page.keyboard.press("Control+Shift+g");
  await expect(page.locator("#hint")).toContainText("Exploded");
  // Its seven parts are top-level components now; all of them grouped.
  const top = async () => (await page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { nodes: { kind: string; parent: number | null }[] } } }).__sawhorse.graph())).nodes.filter((n) => n.parent === null).map((n) => n.kind);
  await expect.poll(top).toEqual(Array(7).fill("instance"));
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await expect.poll(top).toEqual(["group"]);
  await saveAndReopen(page);
  expect(await solids(page)).toHaveLength(7);
});

test("shelf pin holes: hover a face, see the column, click to drill it; one undo removes it", async ({ page }) => {
  await start(page);
  await enable(page, PINS, "Shelf pin holes", ["model.read", "model.write", "ui", "storage"]);
  // A 24 x 12 x 30 in side to drill into.
  await box(page, "24,12", "30");
  const before = (await solids(page))[0];
  const tool = page.locator(`.rail [data-group="plugins"] button[data-tool="plugin:${PINS}/drill"]`);
  await expect(tool).toBeVisible();
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#vcbName")).toHaveText("Count, pitch, dia");
  // The front face (y = 0), 4 in up: a column of 8 previews.
  const p: V3 = [12, 0, 4];
  await hover(page, p, "on-face");
  await expect(page.locator("#hint")).toContainText("Click to drill 8 holes");
  const [x, y] = await at(page, p, 1, -1);
  await page.mouse.click(x, y);
  await expect(page.locator("#hint")).toContainText("Drilled 8 holes");
  const after = (await solids(page))[0];
  // Eight 16-sided holes 5 mm across and 3/8 in deep.
  const hole = 0.5 * 16 * (0.0025 ** 2) * Math.sin((2 * Math.PI) / 16) * 0.375 * IN;
  expect((before.volume - after.volume) * IN ** 3).toBeCloseTo(8 * hole, 9);
  // One Ctrl+Z puts the side back exactly.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await solids(page))[0].volume).toBeCloseTo(before.volume, 9);
  await expect(page.locator("#hint")).toContainText("Undone: Drill 8 shelf pin holes");
});

test("model report: live counts that match the model, and an export as Markdown and CSV", async ({ page }) => {
  await start(page);
  await enable(page, REPORT, "Model report", ["model.read", "ui", "file", "storage"]);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const report = page.locator(`[data-panel="${REPORT}/report"]`);
  const counts = async () => Object.fromEntries(await report.locator('table[data-table="counts"] tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.children[0].textContent, Number(tr.children[1].textContent)])));
  await expect.poll(counts).toMatchObject({ Solids: 0, Faces: 0 });
  // Butt joints and a fixed shelf, so the faces below count by hand (blind dados and
  // adjustable shelves on pins are the defaults).
  await choose(page, `${CABINET}/cabinet`, "joinery", "butt");
  await choose(page, `${CABINET}/cabinet`, "shelfType", "fixed");
  await expect(page.locator(`[data-panel="${CABINET}/cabinet"] [data-section="secBuild"]`)).toContainText("Butt joints");
  await page.locator(`[data-panel="${CABINET}/cabinet"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet");
  // The report follows the edit; its counts are the model's.
  const truth = await page.evaluate(() => {
    const w = window as unknown as { __sawhorse: { graph(): { nodes: { kind: string }[]; definitions: unknown[] }; solids(): unknown[] } };
    const g = w.__sawhorse.graph();
    return { Solids: w.__sawhorse.solids().length, Groups: g.nodes.filter((n) => n.kind === "group").length, Components: g.definitions.length, Instances: g.nodes.filter((n) => n.kind === "instance").length };
  });
  // The default cabinet: a left and a right side (each its own part, notched for the toe kick
  // and grooved for the back: 13 faces, 30 edges), a top and a bottom grooved through for the
  // back (10 faces, 24 edges), one shelf, the back, the toe kick, and the cabinet.
  expect(truth).toEqual({ Solids: 7, Groups: 0, Components: 8, Instances: 8 });
  await expect.poll(counts).toMatchObject({ ...truth, Faces: 3 * 6 + 2 * 13 + 2 * 10, Edges: 3 * 12 + 2 * 30 + 2 * 24 });
  await expect(report.locator('[data-note="size"]')).toContainText("Overall 24 wide x 23 1/4 deep x 34 1/2 high");
  await expect(report.locator('[data-note="warnings"]')).toHaveText("No warnings.");
  // Units: millimetres, remembered by the plugin.
  await report.locator('[data-field="units"]').selectOption("mm");
  await expect(report.locator('[data-note="size"]')).toContainText("Overall 609.6 mm wide");
  // Export: Markdown, then CSV, through the save dialog (downloads here).
  const downloads: string[] = [];
  page.on("download", async (d) => downloads.push(readFileSync((await d.path())!, "utf8")));
  await report.locator('[data-action="export"]').click();
  // Lane 17: no save dialog in this browser, so the app asks before each download, naming
  // the plugin, the file and its size; nothing is downloaded before the person says yes.
  for (const name of ["Untitled report.md", "Untitled report.csv"]) {
    const ask = page.getByRole("dialog", { name: `Save ${name}?` });
    await expect(ask).toContainText(`Model report wants to save ${name} (`);
    await expect(ask).toContainText(/\d[\d,]* bytes\)/);
    expect(downloads.length).toBe(name.endsWith(".md") ? 0 : 1);
    await ask.getByRole("button", { name: "Save" }).click();
    await expect(ask).toHaveCount(0);
    if (name.endsWith(".md")) await expect.poll(() => downloads.length).toBe(1);
  }
  await expect(page.locator("#hint")).toContainText("Saved Untitled report.md and Untitled report.csv");
  await expect.poll(() => downloads.length).toBe(2);
  const md = downloads.find((d) => d.startsWith("# Model report"))!;
  expect(md).toContain("| Solids | 7 |");
  // The cabinet is drawn at the measured 23/32 in (18.3 mm) of "3/4" ply.
  expect(md).toMatch(/\| Shelf \| 1 \| 18\.3 mm \|/);
  const csv = downloads.find((d) => d.includes("Section,Item,Value"))!;
  expect(csv).toContain("Counts,Instances,8");
});

// The verifier: a zip with the same id and permissions as an enabled sample replaced it and
// ran at once with the sample's grant, without a dialog. A grant now belongs to the files.
test("a plugin claiming an enabled sample's id does not run on the sample's grant", async ({ page }) => {
  await start(page);
  const perms = ["model.read", "ui", "file", "storage"];
  await enable(page, REPORT, "Model report", perms);
  const evil = {
    "plugin.json": JSON.stringify({ id: REPORT, name: "Model report (evil)", version: "1.0.0", api: 1, description: "Not the sample.", author: "Someone", license: "MIT", permissions: perms }),
    "main.js": 'import { model } from "sawhorse";\nawait model.solids();\nconsole.log("evil ran");',
  };
  await page.evaluate((f) => (window as unknown as { __sawhorse: { plugins: { loadSession(f: Record<string, string>): Promise<string> } } }).__sawhorse.plugins.loadSession(f), evil);
  await expect(row(page, REPORT)).toHaveAttribute("data-status", "disabled");
  await expect(row(page, REPORT)).toContainText("Model report (evil)");
  await expect(row(page, REPORT)).toContainText("These are not the files you enabled (it takes the place of the bundled Model report)");
  const logs = await page.evaluate((id) => (window as unknown as { __sawhorse: { plugins: { list(): { id: string; logs: string[] }[] } } }).__sawhorse.plugins.list().find((e) => e.id === id)!.logs, REPORT);
  expect(logs.join("\n")).not.toContain("evil ran");
  // Enabling it is the person's choice, and the dialog says what it replaces.
  await row(page, REPORT).locator('[data-do="enable"]').click();
  const dialog = page.getByRole("dialog", { name: "Enable Model report (evil)" });
  await expect(dialog.locator("[data-replaces]")).toContainText("same id as the bundled sample Model report");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, REPORT)).toHaveAttribute("data-status", "disabled");
});

// The plugin's document store holds 64 KB. Each change to a cabinet rebuilds it as a new
// instance, and its settings were kept whole (1.5 KB) for every instance it had been: after
// about 40 changes the store refused, and the cabinet just made was no longer one the panel
// could edit ("Could not update the cabinet"). Kept compact and pruned, a cabinet takes any
// number of changes; a row on its base frame saves, opens again, and is still a row on a frame.
test("cabinet generator: 45 changes in a row keep the cabinet editable; a row on its base frame saves and opens as one", async ({ page }) => {
  test.setTimeout(180_000);
  await start(page);
  await enable(page, CABINET, "Cabinet generator", ["model.read", "model.write", "ui", "storage"]);
  const panel = `${CABINET}/cabinet`;
  const rows = `${CABINET}/rows`;
  const status = page.locator(`[data-panel="${panel}"] [data-note="status"]`);
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 1");
  for (let k = 0; k < 45; k++) {
    const w = String(20 + (k % 10));
    await field(page, panel, "width", w);
    await expect.poll(async () => Math.round((Math.max(...(await solids(page)).map((x) => x.max[0])) - Math.min(...(await solids(page)).map((x) => x.min[0]))) * 1e4) / 1e4).toBe(Number(w));
    // Let the rebuild's selection and panel updates land before typing again (a fill that a
    // redraw splits between its select-all and its typing appends instead of replacing).
    await expect(page.locator(`[data-panel="${panel}"] [data-field="width"]`)).toHaveValue(w);
    await page.waitForTimeout(250);
  }
  await expect(status).toContainText("Editing Cabinet 1");
  await expect(page.locator("#hint")).not.toContainText("could not be kept");
  // A second cabinet beside it, the row on a base frame.
  await page.keyboard.press("Escape");
  const vp = (await page.locator("main.vp").boundingBox())!;
  await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  await expect(status).toContainText("Adds Cabinet 2");
  await page.locator(`[data-panel="${panel}"] [data-action="generate"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Cabinet 2");
  await page.locator(`[data-panel="${rows}"] [data-action="makeBase"]`).click();
  await expect(page.locator("#hint")).toContainText("Made Base frame 1 under 2 cabinets");
  await saveAndReopen(page);
  // Opened again: the frame is ours (its settings, live), and the cabinets a row on it.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Base frame 1" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(page.locator(`[data-panel="${rows}"] [data-note="row"]`)).toContainText("Row of 2: Cabinet 1, Cabinet 2");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("Changes apply as you make them");
  await expect(page.locator(`[data-panel="${rows}"] [data-action="refit"]`)).toBeDisabled();
  // Cabinet 2 made wider: the frame says the row has changed, and Fit to the row again fits it.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Cabinet 2" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(status).toContainText("Editing Cabinet 2");
  await field(page, panel, "width", "30");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="row"]`)).toContainText(/Row of 2: .* · 54 long, .* · on Base frame 1/);
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: "Base frame 1" }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("The row has changed");
  await page.locator(`[data-panel="${rows}"] [data-action="refit"]`).click();
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("Changes apply as you make them");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="row"]`)).toContainText(/ 54 long/);
});
