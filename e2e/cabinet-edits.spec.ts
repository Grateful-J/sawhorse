import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { at, box, setUnits, solids, type V3 } from "./helpers";

// The cabinet generator's edits that race or go wrong around the panel (the plugin review's
// findings): a double-click on its buttons, an Undo inside an open cabinet, ids handed out
// again, a document from 1.1.0, a click on another cabinet while a change waits, refused
// edits, copies, hidden cabinets, names, units and hand scaling. Each drives the app as a
// person would and reads the model back.

const CABINET = "com.sawhorse3d.cabinet-generator";
const panel = `${CABINET}/cabinet`;
const rows = `${CABINET}/rows`;
const requireKernel = !!process.env.REQUIRE_KERNEL;

async function start(page: Page) {
  await page.goto("/?autosave=0&io=basic");
  const vp = page.locator("main.vp");
  await expect(vp).not.toHaveAttribute("data-kernel", "loading", { timeout: 15_000 });
  if (!requireKernel && (await vp.getAttribute("data-kernel")) === "missing") test.skip(true, "kernel WASM not built");
  await expect(vp).toHaveAttribute("data-kernel", "ready");
  await page.getByRole("tab", { name: "Plugins" }).click();
  const row = page.locator(`.plugin-row[data-plugin="${CABINET}"]`);
  await row.locator('[data-do="enable"]').click();
  await page.getByRole("dialog", { name: "Enable Cabinet generator" }).getByRole("button", { name: "Enable" }).click();
  await expect(row).toHaveAttribute("data-status", "running", { timeout: 10_000 });
}

const SECTION_OF: Record<string, string> = { width: "secSize", height: "secSize", depth: "secSize", base: "secSize", layout: "secLayout", shelves: "secLayout", drawers: "secLayout" };
async function openSection(page: Page, p: string, id: string) {
  const head = page.locator(`[data-panel="${p}"] [data-section="${id}"]`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
}
const fld = (page: Page, p: string, id: string) => page.locator(`[data-panel="${p}"] [data-field="${id}"]`);
async function field(page: Page, p: string, id: string, value: string) {
  if (p === panel && SECTION_OF[id]) await openSection(page, p, SECTION_OF[id]);
  await fld(page, p, id).fill(value);
  await fld(page, p, id).press("Enter");
}
async function choose(page: Page, p: string, id: string, value: string) {
  if (p === panel && SECTION_OF[id]) await openSection(page, p, SECTION_OF[id]);
  await fld(page, p, id).selectOption(value);
}
const status = (page: Page) => page.locator(`[data-panel="${panel}"] [data-note="status"]`);
const hint = (page: Page) => page.locator("#hint");
const gen = (page: Page) => page.locator(`[data-panel="${panel}"] [data-action="generate"]`);
const action = (page: Page, p: string, id: string) => page.locator(`[data-panel="${p}"] [data-action="${id}"]`);
const rowNote = (page: Page) => page.locator(`[data-panel="${rows}"] [data-note="row"]`);

type GNode = { id: number; kind: string; name: string | null; label: string; parent: number | null; definition: number | null; hidden: boolean };
const graph = (page: Page) => page.evaluate(() => (window as unknown as { __sawhorse: { graph(): { context: number | null; nodes: GNode[] } } }).__sawhorse.graph());
/** The names of the top-level groups and instances. */
const tops = async (page: Page) => (await graph(page)).nodes.filter((n) => n.parent === null).map((n) => n.name ?? n.label);
/** The model's extent, in inches, rounded. */
async function extent(page: Page) {
  const ss = await solids(page);
  return [0, 1, 2].map((k) => Math.round((Math.max(...ss.map((x) => x.max[k])) - Math.min(...ss.map((x) => x.min[k]))) * 1e3) / 1e3);
}
async function top(page: Page) {
  const ss = await solids(page);
  return Math.round(Math.max(...ss.map((x) => x.max[2])) * 1e3) / 1e3;
}
async function empty(page: Page) {
  await page.keyboard.press("Escape");
  const vp = (await page.locator("main.vp").boundingBox())!;
  await page.mouse.click(vp.x + 40, vp.y + vp.height - 60);
  await expect(status(page)).toContainText("Adds");
}
async function clickAt(page: Page, p: V3) {
  const [x, y] = await at(page, p);
  await page.mouse.click(x, y);
}
async function make(page: Page, n: number) {
  await gen(page).click();
  await expect(hint(page)).toContainText(`Made Cabinet ${n}`);
}
/** Select a top-level node from the Outliner, back on the Plugins tab after. */
async function outline(page: Page, name: string) {
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.locator('.outline li[data-kind="instance"]', { hasText: name }).first().locator(".label").first().click();
  await page.getByRole("tab", { name: "Plugins" }).click();
}
/** Move+Ctrl the selection `d` in along red. */
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
  await expect.poll(async () => (await tops(page)).length).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
}

test("#1 a double-click on Generate, Line up and Put the row on a base frame does each once", async ({ page }) => {
  await start(page);
  await choose(page, panel, "base", "none");
  await gen(page).dblclick();
  await expect(hint(page)).toContainText("Made Cabinet 1");
  await page.waitForTimeout(1500);
  expect(await tops(page)).toEqual(["Cabinet 1"]);
  // Cabinet 2 apart, then the two lined up with a double-click: butted once, not twice (it ended 2 in inside Cabinet 1).
  await empty(page);
  await choose(page, panel, "place", "apart");
  await make(page, 2);
  expect((await extent(page))[0]).toBe(50);
  await empty(page);
  await page.keyboard.press("Control+a");
  await expect(action(page, rows, "lineUp")).toBeVisible();
  await action(page, rows, "lineUp").dblclick();
  await expect(hint(page)).toContainText("Lined up 2 cabinets");
  await page.waitForTimeout(1500);
  expect((await extent(page))[0]).toBe(48);
  // The row on a base frame, double-clicked: one frame, the cabinets lifted once (4 in, to 38 1/2).
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  await expect(rowNote(page)).toContainText("Row of 2");
  await action(page, rows, "makeBase").dblclick();
  await expect(hint(page)).toContainText("Made Base frame 1");
  await page.waitForTimeout(1500);
  expect((await tops(page)).filter((n) => /Base frame/.test(n))).toEqual(["Base frame 1"]);
  expect(await top(page)).toBe(38.5);
});

test("#2 an edit made inside an open cabinet, undone: the panel shows what the model is, and nothing re-applies it", async ({ page }) => {
  await start(page);
  await make(page, 1);
  // Double-click into it and widen it: rebuilt in place, the same instance.
  const [x, y] = await at(page, [12, 11.6, 34.5]);
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await graph(page)).context).not.toBeNull();
  await field(page, panel, "width", "30");
  await expect.poll(async () => (await extent(page))[0]).toBe(30);
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await extent(page))[0]).toBe(24);
  // The panel follows the Undo: 24 wide, everywhere it says so.
  await expect(fld(page, panel, "width")).toHaveValue("24");
  await expect(page.locator(`[data-panel="${panel}"] [data-section="secSize"]`)).toContainText("24 ×");
  await expect(rowNote(page)).toContainText("24 long");
  // The next cabinet goes against the 24 in cabinet, with no gap (it went 6 in off, at 30).
  await page.keyboard.press("Escape");
  await empty(page);
  await make(page, 2);
  expect((await extent(page))[0]).toBe(48);
  // And a later rebuild of Cabinet 1 (its row put on a base frame) builds it 24 wide, not 30.
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  await action(page, rows, "makeBase").click();
  await expect(hint(page)).toContainText("Made Base frame 1");
  expect((await extent(page))[0]).toBe(48);
});

test("#3 an id handed out again after an Undo is not taken for a cabinet: the row and the row's tools are right", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(8);
  await page.waitForTimeout(700);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await solids(page)).length).toBe(7);
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  await empty(page);
  await make(page, 2);
  await empty(page);
  await make(page, 3);
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  // It said "Row of 3: Cabinet 1, Cabinet 2, Left side", and refused the base frame and a width change.
  await expect(rowNote(page)).toContainText("Row of 3: Cabinet 1, Cabinet 2, Cabinet 3");
  await field(page, panel, "width", "30");
  await expect.poll(async () => (await extent(page))[0]).toBe(78);
});

test("#4 no new cabinet inside an open one; a cabinet holding what the plugin did not make is rebuilt only on a press", async ({ page }) => {
  await start(page);
  await make(page, 1);
  const [x, y] = await at(page, [12, 11.6, 34.5]);
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await graph(page)).context).not.toBeNull();
  await expect(gen(page)).toHaveText("Add another like this");
  await gen(page).click();
  await expect(hint(page)).toContainText("Leave Cabinet 1 first (Esc): a new cabinet cannot be made inside a cabinet or a base frame.");
  expect((await graph(page)).nodes.filter((n) => /^Cabinet/.test(n.name ?? "")).length).toBe(1);
  // A box drawn inside the open cabinet: the plugin did not make it.
  await box(page, "4,4", "4");
  expect((await solids(page)).length).toBe(8);
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await empty(page);
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  await field(page, panel, "shelves", "2");
  await expect(status(page)).toContainText("Cabinet 1 holds something this plugin did not make (a solid): rebuilding it would delete it. Move it out first, or press Rebuild it anyway.");
  await page.waitForTimeout(800);
  expect((await solids(page)).length).toBe(8);
  // The press rebuilds it: two shelves, the box gone with it.
  await action(page, panel, "replace").click();
  await expect.poll(async () => (await solids(page)).length).toBe(8);
  await expect(fld(page, panel, "shelves")).toHaveValue("2");
  await expect(action(page, panel, "replace")).toHaveCount(0);
  await expect(status(page)).toContainText("Editing Cabinet 1: changes apply as you make them");
});

/** Save the document (a download, with io=basic) and give back its bytes. */
async function save(page: Page) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  return readFileSync((await d.path())!);
}
/** The document with the plugin's store rewritten. */
function rewrite(buf: Buffer, edit: (store: Record<string, unknown>) => void) {
  const files = unzipSync(new Uint8Array(buf));
  const whole = JSON.parse(strFromU8(files["plugin-data.json"]));
  const find = (o: unknown): Record<string, unknown> | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (r[CABINET] && typeof r[CABINET] === "object") return r[CABINET] as Record<string, unknown>;
    for (const v of Object.values(r)) {
      const f = find(v);
      if (f) return f;
    }
    return null;
  };
  edit(find(whole)!);
  files["plugin-data.json"] = strToU8(JSON.stringify(whole));
  return Buffer.from(zipSync(files));
}

test("#5 a cabinet from plugin 1.1.0 (no settings kept) is never replaced by the new-cabinet draft without a press", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(8);
  await page.waitForTimeout(600);
  // What 1.1.0 kept: the one cabinet's id.
  const legacy = rewrite(await save(page), (store) => {
    const id = store.last as number;
    for (const k of Object.keys(store)) delete store[k];
    store.cabinet = id;
  });
  await empty(page);
  await fld(page, panel, "preset").selectOption("drawers");
  await expect(status(page)).toContainText("Adds Drawer base 2");
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("file-input").setInputFiles({ name: "legacy.shz", mimeType: "application/octet-stream", buffer: legacy });
  await expect.poll(async () => (await solids(page)).length).toBe(8);
  await clickAt(page, [12, 11.6, 34.5]);
  await expect(status(page)).toContainText("Cabinet 1 was made by an older version of this plugin, which did not keep its settings: the panel shows the settings for a new cabinet. Set them to what it should be, then press Replace it with these settings.");
  await expect(action(page, panel, "replace")).toHaveText("Replace it with these settings");
  // A change is not the update here: the cabinet stays as it is (it became an 18 in drawer base).
  await field(page, panel, "height", "35");
  await page.waitForTimeout(1500);
  expect(await extent(page)).toEqual([24, 23.25, 34.5]);
  expect((await solids(page)).length).toBe(8);
  // The press replaces it, with the settings shown.
  await action(page, panel, "replace").click();
  await expect.poll(async () => (await extent(page))[2]).toBe(35);
  expect((await extent(page))[0]).toBe(18);
  await expect(status(page)).toContainText("Editing Drawer base");
  await expect(action(page, panel, "replace")).toHaveCount(0);
});

test("#6 a change, then a click on another cabinet before it is built: it is built on the cabinet it was made for, and the panel stays on the one clicked", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await empty(page);
  await make(page, 2);
  let h = 34.5;
  for (const gap of [0, 120, 240, 300, 360]) {
    await empty(page);
    await clickAt(page, [12, 11.6, h]);
    await expect(status(page)).toContainText("Editing Cabinet 1");
    h += 1;
    await openSection(page, panel, "secSize");
    await fld(page, panel, "height").fill(String(h));
    const [x2, y2] = await at(page, [36, 11.6, 30]);
    await fld(page, panel, "height").press("Enter");
    if (gap) await page.waitForTimeout(gap);
    await page.mouse.click(x2, y2);
    await expect(status(page)).toContainText("Editing Cabinet 2");
    await expect.poll(async () => (await extent(page))[2], `gap ${gap}`).toBe(h);
    await page.waitForTimeout(600);
    await expect(status(page), `gap ${gap}`).toContainText("Editing Cabinet 2");
    await expect(fld(page, panel, "height")).toHaveValue("34 1/2");
  }
  // Typed and not committed: the click away commits it, to Cabinet 1; Cabinet 2 is not rebuilt for it.
  await empty(page);
  await clickAt(page, [12, 11.6, 30]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  const c2 = (await graph(page)).nodes.find((n) => n.name === "Cabinet 2")!.id;
  await fld(page, panel, "width").fill("30");
  await clickAt(page, [36, 11.6, 30]);
  await expect(status(page)).toContainText("Editing Cabinet 2");
  await expect.poll(async () => (await extent(page))[0]).toBe(54);
  expect((await graph(page)).nodes.find((n) => n.name === "Cabinet 2")!.id).toBe(c2);
});

test("#7 base frame: a second setting changed while the first is built lands too, and new frames are numbered by the frames there", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await action(page, rows, "makeBase").click();
  await expect(hint(page)).toContainText("Made Base frame 1");
  for (const [gap, hgt] of [[250, "4 1/4"], [270, "4 1/2"], [290, "4 3/4"]] as const) {
    await fld(page, rows, "height").fill("5");
    await fld(page, rows, "height").press("Enter");
    await page.waitForTimeout(gap);
    await fld(page, rows, "setback").fill(hgt);
    await fld(page, rows, "setback").press("Enter");
    await page.waitForTimeout(2000);
    await expect(fld(page, rows, "setback")).toHaveValue(hgt);
    // Kept with the frame: selected again, it shows both.
    await empty(page);
    await clickAt(page, [12, 11.6, 30]);
    await action(page, rows, "selectBase").click();
    await expect(fld(page, rows, "height")).toHaveValue("5");
    await expect(fld(page, rows, "setback")).toHaveValue(hgt);
    await fld(page, rows, "height").fill("4");
    await fld(page, rows, "height").press("Enter");
    await page.waitForTimeout(1500);
  }
  // Base frame 1 was rebuilt many times: a frame for another row is Base frame 2 (it was 5 and more).
  await empty(page);
  await choose(page, panel, "place", "apart");
  await make(page, 2);
  await action(page, rows, "makeBase").click();
  await expect(hint(page)).toContainText("Made Base frame 2");
});

test("#8 a short row with its ends showing: the plan says why, and the next cabinet is made and says so", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await choose(page, rows, "ends", "both");
  await field(page, rows, "setback", "12");
  await expect(page.locator(`[data-panel="${rows}"] [data-note="baseStatus"]`)).toContainText("The ends' setback leaves too short a ladder under this row");
  await expect(action(page, rows, "makeBase")).toBeDisabled();
  await empty(page);
  await choose(page, panel, "place", "apart");
  await make(page, 2);
});

test("#9 edits that cannot be made say what to do, and the panel goes back to what the model is", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await empty(page);
  await make(page, 2);
  // Open Cabinet 1, then one of its parts (its top): the cabinet cannot be rebuilt from there.
  const [x, y] = await at(page, [12, 11.6, 34.5]);
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await graph(page)).context).not.toBeNull();
  const open = (await graph(page)).context;
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await graph(page)).context).not.toBe(open);
  await field(page, panel, "shelves", "2");
  await expect(hint(page)).toContainText("Leave the part (Esc) to change the cabinet.");
  await expect(fld(page, panel, "shelves")).toHaveValue("1");
  expect((await solids(page)).length).toBe(14);
  // Back in the cabinet, its width: the cabinet right of it would move, and it is not open.
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await graph(page)).context).toBe(open);
  await field(page, panel, "width", "30");
  await expect(hint(page)).toContainText("Close the cabinet (Esc) to change its width: the cabinets right of it move with it.");
  await expect(fld(page, panel, "width")).toHaveValue("24");
  expect((await extent(page))[0]).toBe(48);
  // A change that can be made, open, still is.
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(15);
});

test("#10 a Move+Ctrl copy of a cabinet is that cabinet: in the row, editable, never built over", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await copyRight(page, [12, 11.6, 34.5], 24);
  expect((await extent(page))[0]).toBe(48);
  await empty(page);
  // The new cabinet goes right of the row, the copy included (it went on top of the copy).
  await make(page, 2);
  expect((await extent(page))[0]).toBe(72);
  await expect(rowNote(page)).toContainText("Row of 3: Cabinet 1, Cabinet 1, Cabinet 2");
  // The copy is edited as a cabinet: only it changes.
  await empty(page);
  await clickAt(page, [36, 11.6, 30]);
  await expect(status(page)).toContainText("Editing Cabinet 1");
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(22);
  // Cabinet 1 itself still has its one shelf.
  await empty(page);
  await clickAt(page, [12, 11.6, 30]);
  await expect(fld(page, panel, "shelves")).toHaveValue("1");
});

test("#11 #12 #13 a rebuild keeps a cabinet hidden; Add another takes a name not in use; after an Undo the next cabinet goes against the row", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await empty(page);
  await make(page, 2);
  // Add another from Cabinet 1: Cabinet 3, not a second Cabinet 2.
  await empty(page);
  await clickAt(page, [12, 11.6, 30]);
  await expect(gen(page)).toHaveText("Add another like this");
  await gen(page).click();
  await expect(hint(page)).toContainText("Made Cabinet 3");
  expect((await tops(page)).sort()).toEqual(["Cabinet 1", "Cabinet 2", "Cabinet 3"]);
  // Hidden in the Outliner, then changed: still hidden.
  await page.getByRole("tab", { name: "Outliner" }).click();
  await page.getByRole("button", { name: "Hide Cabinet 2" }).click();
  await outline(page, "Cabinet 2");
  await expect(status(page)).toContainText("Editing Cabinet 2");
  await field(page, panel, "shelves", "2");
  await expect.poll(async () => (await solids(page)).length).toBe(22);
  await page.waitForTimeout(500);
  expect((await graph(page)).nodes.find((n) => n.name === "Cabinet 2")!.hidden).toBe(true);
  // Cabinet 3 changed and the change undone: the next new cabinet still goes against the row.
  await outline(page, "Cabinet 3");
  await field(page, panel, "shelves", "3");
  await expect.poll(async () => (await solids(page)).length).toBe(24);
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await solids(page)).length).toBe(22);
  await empty(page);
  await expect(status(page)).toContainText("'s row.");
  await make(page, 4);
  expect((await extent(page))[0]).toBe(96);
});

test("#14 #15 units switched: the summaries follow, and an inch cabinet keeps its drawer boxes when edited in a metric document", async ({ page }) => {
  await start(page);
  await fld(page, panel, "preset").selectOption("drawers");
  await expect(status(page)).toContainText("Adds Drawer base");
  await gen(page).click();
  await expect(hint(page)).toContainText("Made Drawer base");
  const shape = async () => (await solids(page)).map((s) => [s.min, s.max].flat().map((v) => Math.round(v * 1e4) / 1e4).join(",")).sort();
  const before = await shape();
  await setUnits(page, "mm");
  await expect(page.locator(`[data-panel="${panel}"] [data-section="secSize"]`)).not.toContainText("1/2");
  await expect(rowNote(page)).toContainText("457.2 long");
  // A change that moves nothing (its name): rebuilt, and every part where it was, drawer boxes too.
  await fld(page, panel, "name").fill("Drawer base A");
  await fld(page, panel, "name").press("Enter");
  await expect.poll(async () => (await tops(page))[0]).toBe("Drawer base A");
  expect(await shape()).toEqual(before);
});

test("#19 a cabinet scaled by hand is not rebuilt from its settings; the panel says so", async ({ page }) => {
  await start(page);
  await make(page, 1);
  await page.keyboard.press("s");
  const g = await at(page, [24, 11.625, 17.25]);
  await expect(async () => {
    await page.mouse.move(g[0] + 3, g[1] + 2);
    await page.mouse.move(g[0], g[1], { steps: 2 });
    await expect(page.locator(".vlabel.grip.hot")).toHaveCount(1, { timeout: 800 });
  }).toPass({ timeout: 10_000 });
  await page.mouse.click(g[0], g[1]);
  await page.mouse.move(g[0] + 40, g[1], { steps: 3 });
  await page.keyboard.type("1.5");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await extent(page))[0]).toBe(36);
  await page.keyboard.press("Space");
  await empty(page);
  await clickAt(page, [18, 11.6, 34.5]);
  await expect(status(page)).toContainText("Cabinet 1 was scaled or mirrored by hand, so it cannot be rebuilt from its settings");
  await field(page, panel, "shelves", "2");
  await page.waitForTimeout(1500);
  expect((await solids(page)).length).toBe(7);
  expect((await extent(page))[0]).toBe(36);
});

