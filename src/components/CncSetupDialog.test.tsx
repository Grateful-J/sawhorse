import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHOP_KEY, defaultShop, loadShop, type Shop } from "../cam/store";
import { smallNesting } from "../nesting/fixture";
import { CncSetupDialog } from "./CncSetupDialog";
import { NestingSection } from "./NestingSection";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const pick = (label: string, value: string) => fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value } });
const type = (label: string, value: string) => {
  const el = screen.getByLabelText(label);
  fireEvent.change(el, { target: { value } });
  fireEvent.keyDown(el, { key: "Enter" });
};
const warnings = () => [...document.querySelectorAll("[data-warning]")].map((li) => li.getAttribute("data-warning"));

describe("CNC setup: feeds", () => {
  it("opens on Feeds: the Amana 46170 in Baltic birch starts at .0031, dial 3, 113 IPM, ramp 57, with every maker's figure", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Feeds" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("chipload").textContent).toContain("0.0031 in/tooth (0.079 mm/tooth)");
    expect(screen.getByTestId("speed").textContent).toContain("Dial 3: 18,250 RPM on Carbide's shop page");
    expect(screen.getByTestId("speed").textContent).toContain("Carbide's other table says 18,000 RPM");
    expect(screen.getByTestId("feed").textContent).toContain("113 IPM (2,874 mm/min)");
    expect(screen.getByTestId("ramp").textContent).toContain("57 IPM");
    // The spread is worked out for this bit and material, not a fixed "3–5×".
    expect(screen.getByTestId("maker-range").textContent).toContain("5.2 times apart");
    expect(screen.getByTestId("maker-range").textContent).not.toContain("3–5×");
    const rows = within(screen.getByRole("table", { name: "Each maker's figure" })).getAllByRole("row");
    expect(rows.map((r) => r.getAttribute("data-src")).filter(Boolean)).toEqual(expect.arrayContaining(["amana-a1", "amana-a2", "onsrud-o2", "freud", "atoz"]));
    expect(screen.getByTestId("depth").textContent).toContain("deeper than 0.2856 in (7.25 mm)");
    expect(screen.getByTestId("depth").textContent).toContain("85 IPM");
    expect(screen.getByTestId("low-confidence").textContent).toContain("low confidence");
    expect(screen.getByTestId("find-your-number").querySelectorAll("li").length).toBe(7);
    // Every source is shown with its confidence.
    expect(document.querySelector('.cam-src[data-src="forum-85436"]')?.getAttribute("data-conf")).toBe("low");
  });

  it("MDF turns the dial down to 2 (165 IPM); a metric document says mm/min first", () => {
    render(<CncSetupDialog units="mm" onClose={vi.fn()} />);
    pick("Material", "mdf");
    expect(screen.getByTestId("speed").textContent).toContain("Dial 2: 13,500 RPM");
    expect(screen.getByTestId("feed").textContent).toContain("4,183 mm/min (165 IPM)"); // 164.7 IPM exactly
    expect(screen.getByTestId("chipload").textContent).toContain("0.155 mm/tooth (0.0061 in/tooth)");
  });

  it("a dial picked by hand, and a feed to check", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Dial", "6");
    expect(screen.getByTestId("feed").textContent).toContain("192 IPM");
    type("Check a feed (IPM)", "250");
    expect(warnings()).toContain("feed");
    expect(screen.getByTestId("feed").textContent).toContain("Your feed gives");
  });

  it("a compression bit in a 1/4 in dado: stop, the up-cut part cuts it", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Cut", "pocket");
    type("Pocket depth", "1/4");
    const li = document.querySelector('[data-warning="compression-first-pass"]')!;
    expect(li.getAttribute("data-level")).toBe("stop");
    expect(li.textContent).toContain("down-cut");
    expect(screen.getByTestId("stepover").textContent).toContain("40–100%");
  });

  it("a first pass too shallow, then deep enough", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    type("First pass", "0.28");
    expect(warnings()).toContain("compression-first-pass");
    type("First pass", "0.29");
    expect(warnings()).not.toContain("compression-first-pass");
  });

  it("holes: the 1/8 in end mill fits a 5 mm hole, the 1/4 in compression bit does not; the 35 mm cups say never a Forstner", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Bit", "seed-endmill");
    pick("Cut", "hole");
    pick("Hole", "DRILL_D5MM_10MM");
    expect(warnings()).not.toContain("hole-size");
    expect(warnings()).toContain("hole-depth"); // its flute length is unknown
    pick("Bit", "seed-compression");
    expect(warnings()).toContain("hole-size");
    pick("Hole", "DRILL_D35MM_13MM");
    expect(warnings()).not.toContain("hole-size");
    expect(document.body.textContent).toContain("never a Forstner or hinge-boring bit");
  });

  it("the end mill's starting value is flagged as below the bit makers, on purpose", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Bit", "seed-endmill");
    expect(screen.getByTestId("feed").textContent).toContain("73 IPM");
    expect(document.querySelector('[data-warning="chipload-low"]')!.textContent).toContain("on purpose");
  });
});

describe("CNC setup: machine", () => {
  it("the Shapeoko 5 Pro 4x4: travel, Z, the forum's 200 IPM as low confidence, Carbide's two dial tables and how far apart they are", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="machine" />);
    const figs = screen.getByRole("table", { name: "Machine figures" });
    expect(figs.textContent).toContain("48.70 in (1237.00 mm)");
    expect(figs.textContent).toContain("6.10 in (155.00 mm)");
    const warn = screen.getByTestId("feed-warn");
    expect(warn.textContent).toContain("Not published by Carbide; forum figure 200 IPM");
    expect(warn.querySelector(".cam-src")!.getAttribute("data-conf")).toBe("low");
    const dials = screen.getByRole("table", { name: "Carbide Compact Router dial table" });
    expect(dials.textContent).toContain("Carbide's shop page");
    expect(dials.textContent).toContain("Carbide staff chart, 2020");
    expect(screen.getByTestId("dial-gap").textContent).toContain("dial 5: 2,250 RPM");
    expect(screen.getByTestId("shank-limit").textContent).toContain("Up to 0.25 in (6.35 mm); collets 0.125 in and 0.25 in");
  });

  it("the Makita and the DeWalt have one table each; the DeWalt's collet was not found", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="machine" />);
    pick("Router", "makita-rt0701c");
    expect(screen.queryByLabelText("Dial table")).toBeNull();
    expect(screen.getByRole("table", { name: "Makita RT0701C dial table" }).textContent).toContain("17,000 RPM");
    pick("Router", "dewalt-dwp611");
    expect(screen.getByTestId("shank-limit").textContent).toContain("Not found");
  });

  it("a custom machine and a router you type the RPM of, read by Feeds", () => {
    const onShop = vi.fn();
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="machine" onShop={onShop} initial={defaultShop()} />);
    pick("Machine", "custom");
    type("Warn above feed (IPM)", "300");
    pick("Router", "custom");
    type("RPM", "18000");
    const last: Shop = onShop.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ machine: "custom", router: "custom", rpm: 18000, custom: { feedWarnIpm: 300 } });
    fireEvent.click(screen.getByRole("tab", { name: "Feeds" }));
    expect(screen.getByTestId("feed").textContent).toContain("112 IPM"); // 18,000 × 2 × .0031 = 111.6
    expect(screen.getByTestId("speed").textContent).toContain("18,000 RPM, as you typed it");
  });
});

describe("CNC setup: tools", () => {
  it("lists the three bits; editing the up-cut length keeps it, drops its source, and the calculator follows", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    const table = screen.getByRole("table", { name: "Bits" });
    expect(table.textContent).toContain("Amana 46170, 1/4 in compression");
    expect(table.textContent).toContain("up-cut 0.2756 in (7.00 mm) ± 0.010 in (0.25 mm)");
    expect(table.textContent).toContain("shank unknown"); // the down-cut's
    fireEvent.click(screen.getByRole("button", { name: "Edit Amana 46170, 1/4 in compression" }));
    expect(document.querySelector(".cam-from [data-src='amana-a5']")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Up-cut length"), { target: { value: "0.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bit" }));
    const t = loadShop().tools[0];
    expect(t.upcut).toBeCloseTo(0.3 * 0.0254, 12);
    expect(t.from?.upcut).toBeUndefined();
    expect(t.from?.cuttingLength).toBe("amana-a5");
    fireEvent.click(screen.getByRole("tab", { name: "Feeds" }));
    expect(screen.getByTestId("depth").textContent).toContain("deeper than 0.3100 in");
  });

  it("adds a bit, refuses one without a diameter, deletes one, and chooses the profile bit", async () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    fireEvent.change(screen.getByLabelText("Bit name"), { target: { value: "3/8 in compression" } });
    pick("Bit type", "compression");
    fireEvent.click(screen.getByRole("button", { name: "Add bit" }));
    expect(screen.getByRole("alert").textContent).toContain("cutting diameter");
    fireEvent.change(screen.getByLabelText("Cutting diameter"), { target: { value: "3/8" } });
    fireEvent.change(screen.getByLabelText("Flutes"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add bit" }));
    expect(loadShop().tools.map((t) => t.name)).toContain("3/8 in compression");
    fireEvent.click(screen.getByLabelText("Profile bit: 1/8 in end mill"));
    expect(loadShop().profileTool).toBe("seed-endmill");
    fireEvent.click(screen.getByRole("button", { name: "Delete 1/8 in end mill" }));
    expect(loadShop().profileTool).toBeNull();
    expect(loadShop().tools.map((t) => t.id)).not.toContain("seed-endmill");
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Built-in bits" }));
    await waitFor(() => expect(loadShop().tools.map((t) => t.id)).toEqual(["seed-compression", "seed-downcut", "seed-endmill"]));
    ask.mockRestore();
  });

  it("keeps the shop on this device under its own key, and nothing else", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    fireEvent.click(screen.getByLabelText("Profile bit: Amana 46170, 1/4 in compression"));
    expect(Object.keys(localStorage)).toEqual([SHOP_KEY]);
  });

  it("Escape and Done close it", () => {
    const onClose = vi.fn();
    render(<CncSetupDialog units="frac-in" onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "CNC setup" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("CNC setup: the review's findings", () => {
  it("a source label is a control you can reach by keyboard or touch, and it opens to the document", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    const src = document.querySelector('.cam-src[data-src="amana-a1"]') as HTMLDetailsElement;
    expect(src.tagName).toBe("DETAILS");
    const summary = src.querySelector("summary")!;
    expect(summary.textContent).toContain("high");
    fireEvent.click(summary);
    expect(src.open).toBe(true);
    expect(src.textContent).toContain("Solid-Carbide-Compression-Spirals-v12.pdf");
  });

  it("the feed shows its own sources and its confidence: the 1/8 in end mill's is low", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Bit", "seed-endmill");
    const feed = screen.getByTestId("feed");
    expect(feed.textContent).toContain("low confidence");
    expect(feed.querySelector('.cam-src[data-src="report8a"]')?.getAttribute("data-conf")).toBe("low");
    expect(feed.querySelector('.cam-src[data-src="ccr-shop"]')).not.toBeNull();
    expect(screen.getByTestId("ramp").querySelector('.cam-src[data-src="report8a"]')).not.toBeNull();
  });

  it("the community's half-diameter is never offered for a compression bit's first pass", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    expect(screen.getByTestId("depth").textContent).toContain("never for a compression bit's first pass");
    type("Depth per pass", "1/8");
    expect(document.querySelector('[data-warning="compression-first-pass"]')?.getAttribute("data-level")).toBe("stop");
  });

  it("a compression bit in a pocket with no depth typed says to type it", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} />);
    pick("Cut", "pocket");
    expect(document.querySelector('[data-warning="compression-depth-unknown"]')?.textContent).toContain("down-cut");
  });

  it("Built-in bits and Built-in shop ask before they replace your bits", async () => {
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete 1/8 in end mill" }));
    fireEvent.click(screen.getByRole("button", { name: "Built-in bits" }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(loadShop().tools.map((t) => t.id)).not.toContain("seed-endmill");
    fireEvent.click(screen.getByRole("button", { name: "Built-in shop" }));
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(loadShop().tools.map((t) => t.id)).not.toContain("seed-endmill");
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Built-in bits" }));
    await waitFor(() => expect(loadShop().tools.map((t) => t.id)).toContain("seed-endmill"));
    ask.mockRestore();
  });

  it("a bit names its maker: the 46170 is Amana's, and a maker can be set", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Amana 46170, 1/4 in compression" }));
    expect((screen.getByRole("combobox", { name: "Maker" }) as HTMLSelectElement).value).toBe("amana");
    fireEvent.click(screen.getByRole("button", { name: "Edit 1/4 in down-cut" }));
    pick("Maker", "onsrud");
    fireEvent.change(screen.getByLabelText("Shank"), { target: { value: "1/4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bit" }));
    expect(loadShop().tools[1]).toMatchObject({ maker: "onsrud", shank: 0.25 * 0.0254 });
  });
});

describe("the Nesting section opens CNC setup", () => {
  it("keeps ownership and compatible collets explicitly, and clears ownership after editing a bit", () => {
    render(<CncSetupDialog units="frac-in" onClose={vi.fn()} tab="tools" />);
    const owned = screen.getByRole("checkbox", { name: "I own: Amana 46170, 1/4 in compression" });
    expect((owned as HTMLInputElement).checked).toBe(false);
    fireEvent.click(owned);
    const collets = screen.getByLabelText("Confirmed collet sizes (mm, comma-separated)");
    fireEvent.change(collets, { target: { value: "3.175, 6.35" } });
    fireEvent.blur(collets);
    expect(loadShop().collets).toEqual([.003175, .00635]);
    expect(loadShop().tools[0].confirmedOwned).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit Amana 46170, 1/4 in compression" }));
    fireEvent.click(screen.getByRole("button", { name: "Save bit" }));
    expect(loadShop().tools[0].confirmedOwned).toBe(false);
  });

  it("rejects invalid collet sizes and offers legacy CNC layer names", () => {
    render(<CncSetupDialog units="mm" onClose={vi.fn()} tab="tools" />);
    const collets = screen.getByLabelText("Confirmed collet sizes (mm, comma-separated)");
    fireEvent.change(collets, { target: { value: "0, NaN" } });
    fireEvent.blur(collets);
    expect(screen.getByRole("alert").textContent).toContain("collet sizes");
    expect(loadShop().collets).toEqual([]);
    fireEvent.click(screen.getByRole("tab", { name: "Job sheet" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool details in CNC layer names" }));
    expect(loadShop().jobs.toolLayers).toBe(false);
  });

  it("has a CNC setup… button beside Stock…", () => {
    const onCncSetup = vi.fn();
    render(<NestingSection nesting={smallNesting()} rounding="sixteenth" units="frac-in" onSettings={vi.fn()} onStock={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()} onCncSetup={onCncSetup} />);
    fireEvent.click(screen.getByRole("button", { name: "CNC setup…" }));
    expect(onCncSetup).toHaveBeenCalledOnce();
  });

  it("the button is there without a nesting too (the shop is not the model's)", () => {
    render(<NestingSection nesting={null} rounding="sixteenth" units="frac-in" onSettings={vi.fn()} onStock={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()} onCncSetup={vi.fn()} />);
    expect((screen.getByRole("button", { name: "CNC setup…" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
