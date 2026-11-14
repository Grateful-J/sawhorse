import { describe, expect, it, vi } from "vitest";
import type { Nesting } from "../kernel/types";
import { cncSaveMessage, exportBlock, guardedSave, handWorkNote, NEST_FAILED, NEST_PENDING, NEST_REPLACED, NOT_NESTED, sameStamp, savedCount, stampOf, type GuardedSave, type NestStamp } from "./exportGuard";
import { smallNesting } from "./fixture";

const state = (hash: string, log: string) => ({ stats: { hash } as never, log_hash: log });

describe("what a nesting was worked out for", () => {
  it("is the model, the op log and Visible only: any one of them changed is another moment", () => {
    const a = stampOf(state("m1", "l1"), false);
    expect(a).toEqual({ model: "m1", log: "l1", visibleOnly: false });
    expect(sameStamp(a, stampOf(state("m1", "l1"), false))).toBe(true);
    expect(sameStamp(a, stampOf(state("m2", "l1"), false))).toBe(false);
    // An edit and its undo: the model is back, the moment is not.
    expect(sameStamp(a, stampOf(state("m1", "l2"), false))).toBe(false);
    expect(sameStamp(a, stampOf(state("m1", "l1"), true))).toBe(false);
    expect(stampOf(null, false)).toBeNull();
    // A stamp nobody knows is never "the same".
    expect(sameStamp(null, null)).toBe(false);
    expect(sameStamp(undefined, a)).toBe(false);
  });
});

describe("whether the nesting on screen may be saved", () => {
  const n = smallNesting();
  const at: NestStamp = { model: "m1", log: "l1", visibleOnly: false };
  const ok = { nesting: n, stamp: at, now: { ...at }, pending: false, failed: false };

  it("may be, when it is of the model as it is now", () => {
    expect(exportBlock(ok)).toBeNull();
  });

  it("is refused, in words, when the model has changed since, a new nesting is on its way, or the new one failed", () => {
    // Two cabinets nested, one undone, CNC files at once: the model is another, the nesting on
    // screen still the old one, and the busy flag not yet set.
    expect(exportBlock({ ...ok, now: { ...at, model: "m0", log: "l0" } })).toBe(NEST_PENDING);
    expect(exportBlock({ ...ok, now: { ...at, visibleOnly: true } })).toBe(NEST_PENDING);
    expect(exportBlock({ ...ok, pending: true })).toBe(NEST_PENDING);
    // A nesting nobody stamped (from before a document was opened) is as good as stale.
    expect(exportBlock({ ...ok, stamp: undefined })).toBe(NEST_PENDING);
    expect(exportBlock({ ...ok, now: null })).toBe(NEST_PENDING);
    // The new nesting failed: the old one stays on screen, and stays unsaved, for as long as it does.
    expect(exportBlock({ ...ok, failed: true })).toBe(NEST_FAILED);
    expect(exportBlock({ ...ok, failed: true, now: { ...at, model: "m2" } })).toBe(NEST_FAILED);
    expect(exportBlock({ ...ok, nesting: null })).toBe(NOT_NESTED);
    for (const text of [NEST_PENDING, NEST_FAILED, NEST_REPLACED]) expect(text).toMatch(/^Nothing was saved: /);
  });
});

/** A guard whose every step is recorded; `blocked` answers from a queue (then null). */
function guard(over: { blocks?: (string | null)[]; problems?: string[]; unmeasured?: boolean } = {}) {
  const blocks = [...(over.blocks ?? [])];
  const measure = vi.fn(async (_n: Nesting) => "measured once");
  const d = {
    blocked: vi.fn((_n: Nesting) => (blocks.length ? blocks.shift()! : null)),
    measure: over.unmeasured ? undefined : measure,
    problems: vi.fn((_n: Nesting, _m: string | undefined): string[] => over.problems ?? []),
    ask: vi.fn((_problems: string[], _proceed: () => void) => undefined),
    refuse: vi.fn((_why: string) => undefined),
    save: vi.fn((_n: Nesting, _m: string | undefined) => undefined),
  } satisfies GuardedSave<string, string>;
  return { ...d, measured: measure };
}

describe("saving a nesting for cutting", () => {
  const n = smallNesting();

  it("measures once, and the file is written from that very measurement", async () => {
    const d = guard();
    await guardedSave(n, d);
    expect(d.measured).toHaveBeenCalledTimes(1);
    expect(d.problems).toHaveBeenCalledWith(n, "measured once");
    expect(d.save).toHaveBeenCalledTimes(1);
    expect(d.save).toHaveBeenCalledWith(n, "measured once");
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.refuse).not.toHaveBeenCalled();
  });

  it("a file without measured cuts is not measured", async () => {
    const d = guard({ unmeasured: true });
    await guardedSave(n, d);
    expect(d.problems).toHaveBeenCalledWith(n, undefined);
    expect(d.save).toHaveBeenCalledWith(n, undefined);
  });

  it("a stale nesting is refused before anything is measured", async () => {
    const d = guard({ blocks: [NEST_PENDING] });
    await guardedSave(n, d);
    expect(d.refuse).toHaveBeenCalledWith(NEST_PENDING);
    expect(d.measured).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
    const none = guard();
    await guardedSave(null, none);
    expect(none.refuse).toHaveBeenCalledWith(NOT_NESTED);
    expect(none.save).not.toHaveBeenCalled();
  });

  it("a nesting that changed while it was being measured asks nothing and saves nothing", async () => {
    // Fresh at the click; another nesting is on screen by the time the measurement is back.
    const d = guard({ blocks: [null, NEST_REPLACED], problems: ["a problem"] });
    await guardedSave(n, d);
    expect(d.measured).toHaveBeenCalledTimes(1);
    expect(d.refuse).toHaveBeenCalledWith(NEST_REPLACED);
    expect(d.problems).not.toHaveBeenCalled();
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it("problems are asked about first; Save anyway saves what was asked about", async () => {
    const d = guard({ problems: ["drawn 3/4 in thick but nested on a 23/32 in sheet"] });
    await guardedSave(n, d);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalledTimes(1);
    const [problems, proceed] = d.ask.mock.calls[0];
    expect(problems).toEqual(["drawn 3/4 in thick but nested on a 23/32 in sheet"]);
    proceed();
    expect(d.save).toHaveBeenCalledWith(n, "measured once");
    expect(d.measured).toHaveBeenCalledTimes(1);
  });

  it("Save anyway on a dialog left open over an edit saves nothing: the nesting it asked about is gone", async () => {
    const d = guard({ blocks: [null, null, NEST_REPLACED], problems: ["a problem"] });
    await guardedSave(n, d);
    d.ask.mock.calls[0][1]();
    expect(d.refuse).toHaveBeenCalledWith(NEST_REPLACED);
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe("what CNC files says it saved", () => {
  const notes = ["Parts are 3/8 in apart: use a smaller bit than that."];

  it("every file", () => {
    expect(savedCount(9, 9)).toBe("Saved 9 CNC files");
    expect(savedCount(1, 1)).toBe("Saved 1 CNC file");
    expect(cncSaveMessage({ saved: 9, total: 9, stoppedAt: null, hand: null, sawSheets: 0 }, notes)).toBe(`Saved 9 CNC files (one per sheet, millimetres, origin at the lower-left corner). ${notes[0]}`);
  });

  it("3 of 9, then stopped: what was not saved is said, the hand work list included", () => {
    const text = cncSaveMessage({ saved: 3, total: 9, stoppedAt: "Kitchen sheet 04 of 09.dxf", hand: { parts: 2, saved: false, note: null }, sawSheets: 1 }, notes)!;
    expect(text).toContain("Saved 3 of 9 CNC files, then stopped (one per sheet");
    expect(text).toContain("6 sheets were not saved, from Kitchen sheet 04 of 09.dxf on, nor the track saw's hand work list: save again for the rest.");
    expect(text).not.toContain("Saved the hand work");
    const one = cncSaveMessage({ saved: 8, total: 9, stoppedAt: "x.dxf", hand: null, sawSheets: 0 }, [])!;
    expect(one).toContain("1 sheet was not saved, from x.dxf on: save again for the rest.");
  });

  it("the hand work list: saved, not saved, and a note when the saw's parts could not be measured", () => {
    const done = cncSaveMessage({ saved: 2, total: 2, stoppedAt: null, hand: { parts: 3, saved: true, note: null }, sawSheets: 1 }, [])!;
    expect(done).toContain("Saved the hand work on 3 track saw parts.");
    const cancelled = cncSaveMessage({ saved: 2, total: 2, stoppedAt: null, hand: { parts: 1, saved: false, note: null }, sawSheets: 1 }, [])!;
    expect(cancelled).toContain("The hand work list for 1 track saw part was not saved.");
    const blind = cncSaveMessage({ saved: 2, total: 2, stoppedAt: null, hand: { parts: 0, saved: false, note: handWorkNote(null) }, sawSheets: 1 }, [])!;
    expect(blind).toContain("The track saw's parts could not be measured");
    expect(blind).not.toContain("hand work on 0");
  });

  it("never 'Saved 0 CNC files'", () => {
    const allSaw = cncSaveMessage({ saved: 0, total: 0, stoppedAt: null, hand: { parts: 2, saved: true, note: null }, sawSheets: 3 }, notes)!;
    expect(allSaw).toBe(`No CNC files: all 3 sheets are for the track saw. Saved the hand work on 2 track saw parts. ${notes[0]}`);
    expect(cncSaveMessage({ saved: 0, total: 0, stoppedAt: null, hand: { parts: 0, saved: false, note: null }, sawSheets: 1 }, notes)).toBe("No CNC files: the only sheet is for the track saw.");
    expect(cncSaveMessage({ saved: 0, total: 4, stoppedAt: "a.dxf", hand: null, sawSheets: 0 }, notes)).toBe("No CNC files were saved: the first save was cancelled.");
    for (const r of [
      { saved: 0, total: 0, stoppedAt: null, hand: null, sawSheets: 2 },
      { saved: 0, total: 5, stoppedAt: "a.dxf", hand: { parts: 1, saved: false, note: null }, sawSheets: 1 },
    ])
      expect(cncSaveMessage(r, notes)).not.toMatch(/Saved 0/);
  });

  it("a hand work list that would be short says so", () => {
    expect(handWorkNote({ skipped: [] })).toBeNull();
    expect(handWorkNote(null)).toMatch(/could not be measured, so their dados and holes are not listed/);
    expect(handWorkNote({ skipped: ["Left side"] })).toBe("The cuts on Left side could not be measured, so it is missing from the hand work list: mark it from the model.");
    expect(handWorkNote({ skipped: ["Left side", "Door"] })).toContain("they are missing from the hand work list: mark them from the model.");
  });
});
