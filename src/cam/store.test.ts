import { afterEach, describe, expect, it, vi } from "vitest";
import { feedsForLayer, machineOf, profileBit, routerOf, spindleOf, tableOf, toolById } from "./shop";
import { CUSTOM_MACHINE, CUSTOM_ROUTER, SHOP_KEY, defaultShop, loadShop, onShop, readShop, saveShop } from "./store";
import { readTool, seedField, seedTools, toolProblem } from "./tools";

const IN = 0.0254;

afterEach(() => localStorage.clear());

describe("the shop is kept on this device, under its own key", () => {
  it("starts as the Shapeoko 5 Pro 4x4, the Compact Router's shop-page table, the three seeded bits, and no profile bit", () => {
    const s = loadShop();
    expect(s.machine).toBe("shapeoko-5-pro-4x4");
    expect(s.router).toBe("carbide-compact");
    expect(s.table).toBe("shop");
    expect(s.tools.map((t) => t.name)).toEqual(["Amana 46170, 1/4 in compression", "1/4 in down-cut", "1/8 in end mill"]);
    expect(s.profileTool).toBeNull();
    expect(profileBit(s)).toBeNull();
  });

  it("saves and reads back under sawhorse.cam.shop only, and tells whoever listens", () => {
    const heard = vi.fn();
    const off = onShop(heard);
    const s = defaultShop();
    s.profileTool = "seed-endmill";
    s.tools[2] = { ...s.tools[2], shank: 0.125 * IN, from: { ...s.tools[2].from } };
    saveShop(s);
    off();
    expect(Object.keys(localStorage)).toEqual([SHOP_KEY]);
    expect(heard).toHaveBeenCalledOnce();
    const back = loadShop();
    expect(back).toEqual(s);
    expect(profileBit(back)).toEqual({ diameter: 0.125 * IN, name: "1/8 in end mill" });
  });

  it("blocked or broken storage gives the built-in shop", () => {
    localStorage.setItem(SHOP_KEY, "{not json");
    expect(loadShop()).toEqual(defaultShop());
    localStorage.setItem(SHOP_KEY, JSON.stringify({ version: 2 }));
    expect(loadShop()).toEqual(defaultShop());
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadShop()).toEqual(defaultShop());
    get.mockRestore();
  });

  it("anything that does not make sense is dropped: a bad tool, an unknown router, a profile bit that is gone", () => {
    const s = readShop({
      version: 1,
      machine: "a lathe",
      router: "nobody's",
      tools: [seedTools()[0], { id: "x", name: "bad", type: "spoon" }, { id: "y", name: "huge", type: "upcut", diameter: 5 }],
      profileTool: "gone",
      feeds: { tool: "gone", material: "oak", op: "drill" },
      custom: { name: "", travelX: -1, feedWarnIpm: 250, maxShank: 1 },
    });
    expect(s.machine).toBe("shapeoko-5-pro-4x4");
    expect(s.router).toBe("carbide-compact");
    expect(s.tools.map((t) => t.id)).toEqual(["seed-compression"]);
    expect(s.profileTool).toBeNull();
    expect(s.feeds).toEqual({ tool: "seed-compression", material: "baltic-birch", op: "profile" });
    expect(s.custom).toMatchObject({ name: "My machine", travelX: null, feedWarnIpm: 250, maxShank: null });
  });

  it("a source survives only on the seed's own field with the seed's own source", () => {
    const t = readTool({ ...seedTools()[0], from: { upcut: "amana-a5", shank: "freud" } })!;
    expect(t.from).toEqual({ upcut: "amana-a5" });
    expect(seedField(t, "upcut")?.value).toBe(0.2756);
    expect(seedField(t, "shank")).toBeNull();
    expect(readTool({ ...seedTools()[0], id: "mine", from: { upcut: "amana-a5" } })!.from).toEqual({});
  });

  it("says why a bit cannot be saved", () => {
    const t = seedTools()[0];
    expect(toolProblem(t)).toBeNull();
    expect(toolProblem({ ...t, name: " " })).toContain("name");
    expect(toolProblem({ ...t, diameter: null })).toContain("diameter");
    expect(toolProblem({ ...t, flutes: 2.5 })).toContain("whole number");
    expect(toolProblem({ ...t, upcut: 1 * IN })).toContain("longer than the cutting length");
  });
});

describe("the shop's API", () => {
  it("the Shapeoko: travel in metres, the 200 IPM warning with its source", () => {
    const m = machineOf(defaultShop());
    expect(m.travel.x).toBeCloseTo(1.237, 9);
    expect(m.travel.z).toBeCloseTo(0.155, 9);
    expect(m.feedWarn).toMatchObject({ ipm: 200, sourced: { src: "forum-max-feed" } });
  });

  it("a custom machine and a router you type the RPM of", () => {
    const s = defaultShop();
    s.machine = CUSTOM_MACHINE;
    s.custom = { ...s.custom, feedWarnIpm: 300, maxShank: 0.5 * IN };
    s.router = CUSTOM_ROUTER;
    s.rpm = 18000;
    expect(machineOf(s)).toMatchObject({ feedWarn: { ipm: 300, sourced: null }, maxShank: 0.5 * IN });
    expect(routerOf(s)).toBeNull();
    expect(tableOf(s)).toBeNull();
    expect(spindleOf(s)).toEqual({ router: null, table: null, rpm: 18000 });
    const r = feedsForLayer(toolById(s, "seed-compression")!, "mdf", "PROFILE_THRU", {}, s)!;
    expect(r.rpm).toBe(18000);
    expect(Math.round(r.feedIpm!)).toBe(220);
  });

  it("feeds for a layer: a dado layer is a pocket of that depth, a hole layer a hole", () => {
    const s = defaultShop();
    const dado = feedsForLayer(toolById(s, "seed-compression")!, "baltic-birch", "POCKET_6.35MM", {}, s)!;
    expect(dado.warnings.some((w) => w.id === "compression-first-pass")).toBe(true);
    const hole = feedsForLayer(toolById(s, "seed-endmill")!, "baltic-birch", "DRILL_D5MM_10MM", {}, s)!;
    expect(hole.warnings.some((w) => w.id === "hole-size")).toBe(false);
    expect(feedsForLayer(toolById(s, "seed-endmill")!, "baltic-birch", "STOCK", {}, s)).toBeNull();
  });
});

describe("the job sheet's settings, kept with the shop", () => {
  it("start with the down-cut for pockets, the end mill for holes and narrow grooves, the profile bit for cutouts, Sawhorse's hold-down default and letter labels", () => {
    const j = loadShop().jobs;
    expect(j.tools).toEqual({ cutout: null, pocket: "seed-downcut", narrow: "seed-endmill", hole: "seed-endmill" });
    // The most cautious material, so a laminate face's warnings show until it is set.
    expect(j.material).toBe("laminate-bb");
    expect(j.materials).toEqual({});
    expect(j.holdDown).toBeNull();
    expect(j.labels).toEqual({ paper: "letter", size: "4x2in", outlines: true });
  });

  it("read back: a bit that is gone, a nonsense width or paper is the default's; a bit set to none stays none", () => {
    const s = defaultShop();
    const raw = JSON.parse(JSON.stringify(s));
    raw.jobs = { tools: { pocket: "no-such-bit", hole: null }, material: "unobtainium", materials: { "4 x 4 sheet, 3/4": "baltic-birch", "4 x 4 sheet, 1/4": "kryptonite" }, holdDown: -3, labels: { paper: "legal", size: "huge", outlines: false } };
    const back = readShop(raw).jobs;
    expect(back.tools).toEqual({ cutout: null, pocket: "seed-downcut", narrow: "seed-endmill", hole: null });
    expect(back.material).toBe("laminate-bb");
    // A stock's own material is kept; one that is not a material is dropped.
    expect(back.materials).toEqual({ "4 x 4 sheet, 3/4": "baltic-birch" });
    expect(back.holdDown).toBeNull();
    expect(back.labels).toEqual({ paper: "letter", size: "4x2in", outlines: false });
    // A shop saved before job sheets existed reads with the defaults.
    delete raw.jobs;
    expect(readShop(raw).jobs).toEqual(s.jobs);
  });
});
