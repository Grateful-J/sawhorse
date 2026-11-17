// Asked before a nesting is saved for cutting when it has gone wrong (parts on no stock,
// glued up, off the sheet their material names, drawn at a thickness their sheet is not, with
// cuts that would be left out of the file, or on a sheet that is not the router's): what, part
// by part, and whether to save anyway. Esc is Cancel.
import type { NestProblem } from "../nesting/cnc";

export interface NestProblemRequest {
  /** What is about to be saved ("the CNC files"). */
  what: string;
  problems: NestProblem[];
  onSave: () => void;
  onStock: () => void;
  onCnc?: () => void;
  /** One-click fixes, offered first (space the parts for the router, use a bit). */
  fixes?: { label: string; title?: string; run: () => void }[];
}

/** The heading: what is wrong, in a few words. */
function heading(problems: NestProblem[]): string {
  const kinds = new Set(problems.map((p) => p.kind));
  if (kinds.has("spacing")) return "Parts too close for the bit";
  if ([...kinds].every((k) => k === "toolfit")) return "Check your bits";
  if ([...kinds].every((k) => k === "thickness")) return "Sheet thickness doesn't match the drawing";
  if ([...kinds].every((k) => PER_PART.includes(k))) return `${problems.length} part${problems.length === 1 ? "" : "s"} will not be cut as drawn`;
  return "Some parts will not be cut as drawn";
}

/** Problems that are one part each: a heading can count them. The others (a thickness, cuts
 * left out, a sheet of another size) each name several parts, or a sheet. */
const PER_PART: NestProblem["kind"][] = ["unplaced", "glued", "material"];

export function NestProblemDialog({ req, onClose }: { req: NestProblemRequest; onClose: () => void }) {
  const fixes = req.fixes ?? [];
  return (
    <section
      className="name-dialog nest-problem-dialog"
      role="dialog"
      aria-label="The nesting has problems"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <header>
        <b>{heading(req.problems)}</b>
      </header>
      <ul className="nest-problems">
        {req.problems.map((p, i) => (
          <li key={`${p.tag}-${i}`}>
            {p.tag ? <span className="tag">{p.tag}</span> : null} <b>{p.name}</b>: {p.text}
            {p.detail ? <div className="detail">{p.detail}</div> : null}
          </li>
        ))}
      </ul>
      {req.problems.some((p) => p.kind === "toolfit") ? <p className="note">Simulate every toolpath in CAM before cutting. Holes are pocketed with an end mill.</p> : null}
      <div className="btnrow">
        {req.onCnc && req.problems.some((p) => p.kind === "toolfit") ? <button type="button" className="btn" onClick={() => { onClose(); req.onCnc?.(); }}>Open CNC setup...</button> : null}
        {fixes.map((f, i) => (
          <button
            key={f.label}
            type="button"
            className={i === 0 ? "btn primary" : "btn"}
            autoFocus={i === 0}
            title={f.title}
            onClick={() => {
              onClose();
              f.run();
            }}
          >
            {f.label}
          </button>
        ))}
        {req.problems.some((p) => p.kind !== "spacing" && p.kind !== "cuts" && p.kind !== "toolfit") ? (
          <button
            type="button"
            className={fixes.length ? "btn" : "btn primary"}
            autoFocus={!fixes.length}
            onClick={() => {
              onClose();
              req.onStock();
            }}
          >
            Open Stock...
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          onClick={() => {
            onClose();
            req.onSave();
          }}
        >
          Save {req.what} anyway
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}
