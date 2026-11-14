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
        <b>
          {n} part{n === 1 ? "" : "s"} will not be cut as drawn
        </b>
      </header>
      <ul className="nest-problems">
        {req.problems.map((p, i) => (
          <li key={`${p.tag}-${i}`}>
            <span className="tag">{p.tag}</span> {p.name}: {p.text}
          </li>
        ))}
      </ul>
      <div className="btnrow">
        <button
          type="button"
          className="btn primary"
          autoFocus
          onClick={() => {
            onClose();
            req.onStock();
          }}
        >
          Open Stock...
        </button>
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
