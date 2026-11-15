// Whether the nesting on screen may be saved for cutting, and the one path every such save
// takes.
//
// The nesting is worked out again a moment after each edit, so for that moment (and for good,
// when the new nesting fails) the diagrams are of an earlier model. Files saved then would hold
// the old layout with cuts measured from the new model: parts that are gone come out as bare
// rectangles. So each nesting is stamped with the model it was worked out for, and a save is
// refused, in words, unless the stamp is the model as it is now.
import type { DocState, Nesting } from "../kernel/types";

/** What a nesting was worked out for. */
export interface NestStamp {
  /** The model's hash (the stock library and the nesting settings are in it). */
  model: string;
  /** The op log's hash: an edit and its undo are two different moments. */
  log: string;
  /** Only the drawn pieces were nested. */
  visibleOnly: boolean;
}

export function stampOf(state: Pick<DocState, "stats" | "log_hash"> | null | undefined, visibleOnly: boolean): NestStamp | null {
  return state ? { model: state.stats.hash, log: state.log_hash, visibleOnly } : null;
}

export const sameStamp = (a: NestStamp | null | undefined, b: NestStamp | null | undefined) => !!a && !!b && a.model === b.model && a.log === b.log && a.visibleOnly === b.visibleOnly;

export interface ExportState {
  /** The nesting on screen. */
  nesting: Nesting | null;
  /** What it was worked out for (null: not known, which is as good as stale). */
  stamp: NestStamp | null | undefined;
  /** The model and the cut list's Visible only as they are now. */
  now: NestStamp | null;
  /** A nesting is being worked out, or an edit is still on its way to the kernel. */
  pending: boolean;
  /** The last nesting could not be worked out: the one on screen is from before it. */
  failed: boolean;
}

export const NOT_NESTED = "There is no nesting to save yet.";
export const NEST_FAILED = "Nothing was saved: the nesting could not be worked out for the model as it is now, so the diagrams are of an earlier model. Fix what the note in the Nesting section says, then save.";
export const NEST_PENDING = "Nothing was saved: the model changed and the nesting is being worked out again. Save again in a moment.";
export const NEST_REPLACED = "Nothing was saved: the nesting changed while this was being prepared. Look at the new one, then save again.";

/** Why the nesting on screen must not be saved for cutting now, or null when it may be. */
export function exportBlock(s: ExportState): string | null {
  if (!s.nesting) return NOT_NESTED;
  if (s.failed) return NEST_FAILED;
  if (s.pending || !sameStamp(s.stamp, s.now)) return NEST_PENDING;
  return null;
}

export const CUT_PENDING = "Nothing was saved: the model changed and the cut list is being worked out again. Save again in a moment.";

/**
 * Why the shopping list must not be saved now, or null: it takes its sheets and boards from the
 * nesting and its hardware from the cut list, so both must be of the model as it is now (the
 * nesting by `exportBlock`, the cut list by the stamp it was worked out for). Never hardware of
 * one state with sheets of another.
 */
export function shopExportBlock(s: ExportState & { cutStamp: NestStamp | null | undefined }): string | null {
  const nest = exportBlock(s);
  if (nest) return nest;
  return sameStamp(s.cutStamp, s.now) ? null : CUT_PENDING;
}

export interface GuardedSave<M, P> {
  /** Why `n` must not be saved now (`exportBlock`, or it is no longer the nesting on screen). */
  blocked(n: Nesting): string | null;
  /** Measure the cuts for the file, once: the save gets this very measurement. Absent for a
   * file without measured cuts. */
  measure?(n: Nesting): Promise<M>;
  /** What the file would get wrong. */
  problems(n: Nesting, measured: M | undefined): P[];
  /** Show the problems; `proceed` saves anyway. */
  ask(problems: P[], proceed: () => void): void;
  /** Say why nothing was saved. */
  refuse(why: string): void;
  save(n: Nesting, measured: M | undefined): void;
}

/**
 * Save a nesting for cutting: refuse a stale one, measure once, ask about what would go wrong,
 * and save what was looked at. The nesting is checked again after the measurement (the model
 * can change while it runs) and again when "save anyway" is chosen (the dialog can stay open
 * over an edit): at each point a nesting that is no longer the one on screen, or no longer of
 * the model as it is, is refused, never asked about and never saved.
 */
export async function guardedSave<M, P>(n: Nesting | null, d: GuardedSave<M, P>): Promise<void> {
  if (!n) return d.refuse(NOT_NESTED);
  const first = d.blocked(n);
  if (first) return d.refuse(first);
  let measured: M | undefined;
  if (d.measure) {
    measured = await d.measure(n);
    const after = d.blocked(n);
    if (after) return d.refuse(after);
  }
  const save = () => {
    const late = d.blocked(n);
    if (late) return d.refuse(late);
    d.save(n, measured);
  };
  const problems = d.problems(n, measured);
  if (!problems.length) return save();
  d.ask(problems, save);
}

/** "Saved 3 of 9 CNC files, then stopped": how far a run of save dialogs got. */
export function savedCount(saved: number, total: number, what = "CNC file"): string {
  const files = total === 1 ? what : `${what}s`;
  return saved === total ? `Saved ${saved} ${files}` : `Saved ${saved} of ${total} ${files}, then stopped`;
}

export interface CncSaveReport {
  /** Router files written, and how many there were to write. */
  saved: number;
  total: number;
  /** The first file that was not written (a save dialog cancelled), or null. */
  stoppedAt: string | null;
  /** The track saw's hand work: parts in the list, whether the list was written, and whether
   * the saw has sheets at all. "unmeasured": its parts could not be measured. */
  hand: { parts: number; saved: boolean; note: string | null } | null;
  /** How many of the nesting's sheets the track saw cuts. */
  sawSheets: number;
  /** The job sheets written beside the files (one per file; absent: none were asked for). */
  jobs?: number;
}

/** The status line after CNC files: what was written and, in words, what was not. Never
 * "Saved 0 CNC files". Null when nothing was written and nothing needs saying. */
export function cncSaveMessage(r: CncSaveReport, notes: string[]): string | null {
  const said: string[] = [];
  const left = r.total - r.saved;
  if (r.total === 0) {
    said.push(r.sawSheets ? `No CNC files: ${r.sawSheets === 1 ? "the only sheet is" : `all ${r.sawSheets} sheets are`} for the track saw.` : "No CNC files: nothing is nested.");
  } else if (r.saved === 0) {
    return "No CNC files were saved: the first save was cancelled.";
  } else {
    said.push(`${savedCount(r.saved, r.total)} (one per sheet, millimetres, origin at the lower-left corner).`);
    if (r.jobs !== undefined) said.push(r.jobs >= r.saved ? `${r.saved === 1 ? "It has its" : "Each has its"} job sheet beside it (the same name, ending in job.txt).` : `${r.jobs} of their ${r.saved} job sheets ${r.jobs === 1 ? "was" : "were"} saved.`);
    if (left > 0) said.push(`${left} ${left === 1 ? "sheet was" : "sheets were"} not saved${r.stoppedAt ? `, from ${r.stoppedAt} on` : ""}${r.hand && r.hand.parts ? ", nor the track saw's hand work list" : ""}: save again for the rest.`);
  }
  if (r.hand && left === 0) {
    if (r.hand.note) said.push(r.hand.note);
    if (r.hand.parts) said.push(r.hand.saved ? `Saved the hand work on ${r.hand.parts} track saw ${r.hand.parts === 1 ? "part" : "parts"}.` : `The hand work list for ${r.hand.parts} track saw ${r.hand.parts === 1 ? "part" : "parts"} was not saved.`);
  }
  if (r.saved > 0 || (r.hand?.saved ?? false)) said.push(...notes);
  return said.join(" ");
}

/** What to say when the track saw's parts could not be measured, or some could not: the hand
 * work list would be short without saying so. Null when every part was measured. */
export function handWorkNote(measured: { skipped: string[] } | null): string | null {
  if (!measured) return "The track saw's parts could not be measured, so their dados and holes are not listed: mark each from the model.";
  if (measured.skipped.length) return `The cuts on ${measured.skipped.join(", ")} could not be measured, so ${measured.skipped.length === 1 ? "it is" : "they are"} missing from the hand work list: mark ${measured.skipped.length === 1 ? "it" : "them"} from the model.`;
  return null;
}
