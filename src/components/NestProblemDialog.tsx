// Asked before a nesting is saved for cutting when it has gone wrong (parts on no stock,
// glued up, or off the sheet their material names): what, part by part, and whether to save
// anyway. Esc is Cancel.
import type { NestProblem } from "../nesting/cnc";

export interface NestProblemRequest {
  /** What is about to be saved ("the CNC files"). */
  what: string;
  problems: NestProblem[];
  onSave: () => void;
  onStock: () => void;
  /** A one-click fix, offered first (e.g. space the parts for the router). */
  fix?: { label: string; run: () => void };
}

export function NestProblemDialog({ req, onClose }: { req: NestProblemRequest; onClose: () => void }) {
  const n = req.problems.length;
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
        <b>{req.problems.some((p) => p.kind === "spacing") ? "These cuts will not come out as drawn" : `${n} part${n === 1 ? "" : "s"} will not be cut as drawn`}</b>
      </header>
      <ul className="nest-problems">
        {req.problems.map((p, i) => (
          <li key={`${p.tag}-${i}`}>
            {p.tag ? <span className="tag">{p.tag}</span> : null} {p.name}: {p.text}
          </li>
        ))}
      </ul>
      <div className="btnrow">
        {req.fix ? (
          <button
            type="button"
            className="btn primary"
            autoFocus
            onClick={() => {
              onClose();
              req.fix?.run();
            }}
          >
            {req.fix.label}
          </button>
        ) : null}
        {req.problems.some((p) => p.kind !== "spacing") ? (
          <button
            type="button"
            className={req.fix ? "btn" : "btn primary"}
            autoFocus={!req.fix}
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
